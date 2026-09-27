import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  farmsWithCloseFire,
  fireFoyersNearParcelsByCommune,
} from "@/database/sql/fire-clusters.sql";
import { FIRE_ALERT_WINDOW_MS, farmsNearFires } from "@/database/sql/fires.sql";
import {
  evaluateRule,
  parseRuleDefinition,
  usesFireFoyers,
  usesFires,
  type IndicatorValues,
  type RuleNode,
} from "@/modules/monitoring/rules";
import { cropFilterFromDefinition } from "./crop-filter";

// Plan de diffusion d'une alerte (docs/modules/monitoring-parcours-ux.md §2.D) : destinataires
// figés à la création de l'alerte.
// - Exploitations actives de la commune, restreintes aux cultures et stades de la campagne
//   ouverte que cite la règle ; sans condition de culture, toute la commune.
// - Pour chaque producteur : IN_APP s'il a un compte, puis WHATSAPP (numéro + consentement),
//   sinon SMS (consentement), sinon RELAY (l'agent le prévient de vive voix).
// - IN_APP pour chaque agent dont le périmètre couvre la commune (commune ou département).
// - Foyer de feux (ADR-0038) : dès que la condition « foyer » tient dans la commune, toute alerte
//   de feu active reçoit aussi les agents de la commune et les comptes du ministère (IN_APP). Un
//   producteur déjà prévenu par l'alerte remplacée n'a pas de second message, sauf si un feu est
//   désormais à moins de 500 m de sa parcelle (montée en gravité).
// Idempotent : les lignes déjà présentes (clé exploitation, utilisateur, canal) sont conservées.
// La contrainte unique de la table laisse passer les doublons dont une colonne est nulle
// (NULL distincts en PostgreSQL) : l'idempotence est donc assurée ici, par comparaison de clés.

export type Db = Prisma.TransactionClient | PrismaClient;

type Channel = "IN_APP" | "WHATSAPP" | "SMS" | "RELAY";

interface PlannedRow {
  farmId: string | null;
  userId: string | null;
  phoneE164: string | null;
  channel: Channel;
}

export interface PlanSummary {
  alertId: string;
  affectedFarmCount: number;
  affectedAreaHa: number;
  created: number;
  existing: number;
  byChannel: Record<Channel, number>;
}

function keyOf(row: Pick<PlannedRow, "farmId" | "userId" | "channel">): string {
  return `${row.farmId ?? "-"}|${row.userId ?? "-"}|${row.channel}`;
}

/**
 * Vrai si la condition « foyer de feux » tient dans la commune (ADR-0038) : l'alerte a été levée
 * par une règle de foyers, ou une règle de foyers active est vraie sur les foyers des 24 heures.
 */
async function fireFoyerHolds(
  db: Db,
  communeId: string,
  definition: RuleNode,
  since: Date,
): Promise<boolean> {
  if (usesFireFoyers(definition)) return true;
  const rules = (
    await db.rule.findMany({
      where: { enabled: true, category: "FIRE" },
      select: { definition: true },
    })
  )
    .map((rule) => parseRuleDefinition(rule.definition))
    .filter(usesFireFoyers);
  if (rules.length === 0) return false;
  const foyers = (await fireFoyersNearParcelsByCommune([communeId], since)).get(communeId) ?? 0;
  const indicators = { fire_count_near_parcels: foyers } as Partial<IndicatorValues>;
  return rules.some((rule) => evaluateRule(rule, indicators as IndicatorValues).matched);
}

export async function planAlertRecipients(
  db: Db,
  alertId: string,
  now = new Date(),
): Promise<PlanSummary> {
  const alert = await db.alert.findUniqueOrThrow({
    where: { id: alertId },
    select: {
      id: true,
      communeId: true,
      awaitingConfirmation: true,
      commune: { select: { departementId: true } },
      rule: { select: { definition: true } },
    },
  });
  const definition = parseRuleDefinition(alert.rule.definition);
  const filter = cropFilterFromDefinition(definition);
  // Feu de brousse (ADR-0022) : seules les exploitations dont une parcelle est proche d'un feu, et
  // les agents qui les ont enregistrées (ADR-0014), pas toute la commune.
  const fireSince = new Date(now.getTime() - FIRE_ALERT_WINDOW_MS);
  const fireFarms = usesFires(definition) ? await farmsNearFires(alert.communeId, fireSince) : null;
  const foyer = fireFarms
    ? await fireFoyerHolds(db, alert.communeId, definition, fireSince)
    : false;

  // Producteurs déjà prévenus (message envoyé) par une alerte de feu que celle-ci remplace : pas
  // de second message, sauf feu désormais à moins de 500 m de leur parcelle.
  const replaced = fireFarms
    ? await db.alert.findMany({ where: { supersededById: alertId }, select: { id: true } })
    : [];
  const alreadyWarned = new Set<string>();
  if (replaced.length > 0) {
    const [sent, close] = await Promise.all([
      db.alertRecipient.findMany({
        where: {
          alertId: { in: replaced.map((row) => row.id) },
          channel: { in: ["WHATSAPP", "SMS"] },
          status: { in: ["SENT", "DELIVERED", "READ"] },
          farmId: { not: null },
        },
        select: { farmId: true },
      }),
      farmsWithCloseFire(alert.communeId, fireSince),
    ]);
    for (const row of sent) if (row.farmId && !close.has(row.farmId)) alreadyWarned.add(row.farmId);
  }

  const campaign = await db.agriculturalCampaign.findFirst({
    where: { status: "OPEN", archivedAt: null },
    orderBy: { startYear: "desc" },
    select: { id: true },
  });
  const cropWhere: Prisma.ParcelCropWhereInput | null =
    filter.cropCodes || filter.stages
      ? {
          archivedAt: null,
          ...(campaign ? { campaignId: campaign.id } : {}),
          ...(filter.cropCodes ? { crop: { code: { in: filter.cropCodes } } } : {}),
          ...(filter.stages
            ? { stage: { in: filter.stages as Prisma.EnumCropStageFilter["in"] } }
            : {}),
        }
      : null;

  const farms = await db.farm.findMany({
    where: {
      communeId: alert.communeId,
      archivedAt: null,
      ...(cropWhere ? { parcels: { some: { archivedAt: null, crops: { some: cropWhere } } } } : {}),
      ...(fireFarms ? { id: { in: fireFarms.map((farm) => farm.farmId) } } : {}),
    },
    select: {
      id: true,
      declaredAreaHa: true,
      farmer: {
        select: {
          userId: true,
          phoneE164: true,
          channelConsents: {
            where: { granted: true, revokedAt: null },
            select: { channel: true },
          },
        },
      },
    },
  });

  const communeAgents = () =>
    db.roleAssignment.findMany({
      where: {
        role: "AGENT_AGRICULTURE",
        revokedAt: null,
        OR: [
          { scopeType: "COMMUNE", scopeId: alert.communeId },
          { scopeType: "DEPARTEMENT", scopeId: alert.commune.departementId },
        ],
      },
      select: { userId: true },
    });
  const registrars = (fireFarms ?? []).flatMap((farm) =>
    farm.registeredById ? [{ userId: farm.registeredById }] : [],
  );
  const agents = fireFarms
    ? foyer
      ? [...registrars, ...(await communeAgents())]
      : registrars
    : await communeAgents();
  const ministry = foyer
    ? await db.roleAssignment.findMany({
        where: { role: "ADMIN_STATE", revokedAt: null },
        select: { userId: true },
      })
    : [];

  const planned: PlannedRow[] = [];
  // Foyer en attente de confirmation (ADR-0015) : les agents seulement ; les producteurs sont
  // ajoutés à la libération de l'alerte (outbreak-release.ts), par un nouvel appel de ce plan.
  const producers = alert.awaitingConfirmation ? [] : farms;
  for (const farm of producers) {
    const { userId, phoneE164, channelConsents } = farm.farmer;
    const consented = new Set(channelConsents.map((c) => c.channel));
    if (userId) planned.push({ farmId: farm.id, userId, phoneE164: null, channel: "IN_APP" });
    if (alreadyWarned.has(farm.id)) continue;
    const outbound: Channel =
      phoneE164 && consented.has("WHATSAPP")
        ? "WHATSAPP"
        : phoneE164 && consented.has("SMS")
          ? "SMS"
          : "RELAY";
    planned.push({ farmId: farm.id, userId: null, phoneE164, channel: outbound });
  }
  for (const userId of new Set([...agents, ...ministry].map((a) => a.userId))) {
    planned.push({ farmId: null, userId, phoneE164: null, channel: "IN_APP" });
  }

  const existingRows = await db.alertRecipient.findMany({
    where: { alertId },
    select: { farmId: true, userId: true, channel: true },
  });
  const existingKeys = new Set(existingRows.map(keyOf));
  const toCreate = [...new Map(planned.map((row) => [keyOf(row), row])).values()].filter(
    (row) => !existingKeys.has(keyOf(row)),
  );

  if (toCreate.length > 0) {
    await db.alertRecipient.createMany({
      data: toCreate.map((row) => ({
        alertId,
        farmId: row.farmId,
        userId: row.userId,
        phoneE164: row.phoneE164,
        channel: row.channel,
        status: "PENDING",
        nextAttemptAt: row.channel === "WHATSAPP" || row.channel === "SMS" ? now : null,
      })),
    });
  }

  const affectedAreaHa =
    Math.round(farms.reduce((sum, f) => sum + Number(f.declaredAreaHa), 0) * 100) / 100;
  await db.alert.update({
    where: { id: alertId },
    data: { affectedFarmCount: farms.length, affectedAreaHa },
  });

  const byChannel: Record<Channel, number> = { IN_APP: 0, WHATSAPP: 0, SMS: 0, RELAY: 0 };
  for (const row of [...existingRows, ...toCreate]) byChannel[row.channel as Channel] += 1;
  return {
    alertId,
    affectedFarmCount: farms.length,
    affectedAreaHa,
    created: toCreate.length,
    existing: existingRows.length,
    byChannel,
  };
}
