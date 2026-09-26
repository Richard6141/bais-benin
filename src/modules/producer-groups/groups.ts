import { z } from "zod";
import { prisma } from "@/database/client";
import { readCampaigns } from "@/database/sql/dashboard.sql";
import { readMemberParcels } from "@/database/sql/producer-groups.sql";
import { readProducerRanking } from "@/database/sql/producer-ranking.sql";
import type { Prisma } from "@/generated/prisma/client";
import {
  AnalyticsError,
  MAX_RANKING_LIMIT,
  MIN_AREA_FOR_YIELD_HA,
  parseProducerRankingFilters,
  rankingCampaign,
} from "@/modules/analytics";
import { decimal, formatCsv } from "@/modules/analytics/csv";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import { queueFarmerNotifications } from "@/modules/notifications";
import { checkGroupMessage, groupMessageText, normalizeGroupName } from "./rules";
import { groupMessageSubjectId } from "./subject";

// Groupes de producteurs (ADR-0024) : le ministère forme un groupe nommé à partir du palmarès
// (ADR-0018), le consulte, l'exporte et écrit à ses membres sur WhatsApp. Même droit que le
// palmarès (ranking.read, ministère seulement). Les membres sont recalculés ici avec les critères
// reçus, jamais repris d'une liste envoyée par le navigateur. Chaque lecture de la liste nominative,
// chaque export et chaque message sont journalisés.

const MAX_LISTED_GROUPS = 100;
const MAX_LISTED_MESSAGES = 10;
/** Même texte au même groupe dans ce délai : double envoi refusé (double clic, page rechargée). */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const idSchema = z.uuid();

export interface ProducerGroupCriteria {
  cropCode: string;
  campaignCode: string;
  departementCode?: string;
  communeCode?: string;
  metric: "production" | "yield";
  verifiedOnly: boolean;
  limit: number;
  /** Producteurs classables avec ces critères, au moment de la formation. */
  eligibleCount: number;
}

export type CreateGroupResult =
  | { ok: true; id: string; members: number }
  | { ok: false; code: "FORBIDDEN" | "INVALID_NAME" | "INVALID" | "EMPTY" };

export type SendGroupMessageResult =
  | {
      ok: true;
      messageId: string;
      members: number;
      consented: number;
      /** Consentants dont la fiche est de démonstration : mis en file, jamais envoyés. */
      demo: number;
      queued: number;
      notificationIds: string[];
    }
  | {
      ok: false;
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "ARCHIVED"
        | "EMPTY"
        | "TOO_LONG"
        | "LINK"
        | "NO_RECIPIENT"
        | "DUPLICATE";
    };

export type ArchiveGroupResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" };

function requireRankingRight(actor: Actor): void {
  if (!authorize(actor, "ranking.read").allowed) {
    throw new AnalyticsError("FORBIDDEN", "Groupes de producteurs réservés au ministère");
  }
}

function criteriaOf(value: Prisma.JsonValue): ProducerGroupCriteria {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    cropCode: String(raw.cropCode ?? ""),
    campaignCode: String(raw.campaignCode ?? ""),
    departementCode: typeof raw.departementCode === "string" ? raw.departementCode : undefined,
    communeCode: typeof raw.communeCode === "string" ? raw.communeCode : undefined,
    metric: raw.metric === "yield" ? "yield" : "production",
    verifiedOnly: raw.verifiedOnly !== false,
    limit: Number(raw.limit ?? 0),
    eligibleCount: Number(raw.eligibleCount ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Formation d'un groupe
// ---------------------------------------------------------------------------

export async function createGroupFromRanking(
  actor: Actor,
  input: Record<string, unknown>,
  name: string,
  limit: number,
  now = new Date(),
): Promise<CreateGroupResult> {
  if (!authorize(actor, "ranking.read").allowed) return { ok: false, code: "FORBIDDEN" };
  const groupName = normalizeGroupName(name);
  if (!groupName) return { ok: false, code: "INVALID_NAME" };
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RANKING_LIMIT) {
    return { ok: false, code: "INVALID" };
  }
  const filters = parseProducerRankingFilters({ ...input, limit });
  const campaigns = await readCampaigns();
  if (filters.campaignCode && !campaigns.some((c) => c.code === filters.campaignCode)) {
    return { ok: false, code: "INVALID" };
  }
  const campaign = rankingCampaign(campaigns, filters.campaignCode);
  const [crop, departement, commune] = await Promise.all([
    prisma.crop.findUnique({ where: { code: filters.cropCode }, select: { id: true } }),
    filters.departementCode
      ? prisma.departement.findUnique({
          where: { code: filters.departementCode },
          select: { id: true },
        })
      : null,
    filters.communeCode
      ? prisma.commune.findUnique({
          where: { code: filters.communeCode },
          select: { departementId: true },
        })
      : null,
  ]);
  if (!crop) return { ok: false, code: "INVALID" };
  if (filters.departementCode && !departement) return { ok: false, code: "INVALID" };
  if (filters.communeCode && !commune) return { ok: false, code: "INVALID" };

  const rows = await readProducerRanking({
    cropCode: filters.cropCode,
    campaignCode: campaign.code,
    departementCode: filters.departementCode,
    communeCode: filters.communeCode,
    metric: filters.metric,
    verifiedOnly: filters.verifiedOnly,
    minAreaHa: MIN_AREA_FOR_YIELD_HA,
    limit: filters.limit,
  });
  if (rows.length === 0) return { ok: false, code: "EMPTY" };

  const criteria: ProducerGroupCriteria = {
    cropCode: filters.cropCode,
    campaignCode: campaign.code,
    ...(filters.departementCode ? { departementCode: filters.departementCode } : {}),
    ...(filters.communeCode ? { communeCode: filters.communeCode } : {}),
    metric: filters.metric,
    verifiedOnly: filters.verifiedOnly,
    limit: filters.limit,
    eligibleCount: rows[0]?.eligible_count ?? rows.length,
  };
  const group = await prisma.producerGroup.create({
    data: {
      name: groupName,
      cropId: crop.id,
      campaignId: campaign.id,
      departementId: departement?.id ?? commune?.departementId ?? null,
      criteria: { ...criteria },
      createdById: actor.userId,
      createdAt: now,
      members: {
        create: rows.map((row) => ({
          farmerId: row.farmer_id,
          rank: row.rank,
          producedKg: row.production_kg.toFixed(2),
          areaHa: row.area_ha.toFixed(3),
          yieldTPerHa: row.area_ha > 0 ? (row.production_kg / 1000 / row.area_ha).toFixed(3) : null,
          verified: row.all_verified,
        })),
      },
    },
    select: { id: true },
  });
  await recordAudit({
    action: "group.created",
    actorId: actor.userId,
    resourceType: "producerGroup",
    resourceId: group.id,
    details: { criteria: { ...criteria }, members: rows.length },
  });
  return { ok: true, id: group.id, members: rows.length };
}

// ---------------------------------------------------------------------------
// Liste des groupes
// ---------------------------------------------------------------------------

export interface ProducerGroupSummary {
  id: string;
  name: string;
  cropName: string;
  campaignCode: string;
  /** Nom du département, null pour tout le pays. */
  departementName: string | null;
  members: number;
  createdAt: Date;
  createdByName: string;
  archivedAt: Date | null;
}

/** Groupes formés, archivés compris, les plus récents d'abord (pas de liste nominative ici). */
export async function listGroups(actor: Actor): Promise<ProducerGroupSummary[]> {
  requireRankingRight(actor);
  const rows = await prisma.producerGroup.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_LISTED_GROUPS,
    select: {
      id: true,
      name: true,
      createdAt: true,
      archivedAt: true,
      crop: { select: { nameFr: true } },
      campaign: { select: { code: true } },
      departement: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { members: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cropName: row.crop.nameFr,
    campaignCode: row.campaign.code,
    departementName: row.departement?.name ?? null,
    members: row._count.members,
    createdAt: row.createdAt,
    createdByName: row.createdBy.name,
    archivedAt: row.archivedAt,
  }));
}

// ---------------------------------------------------------------------------
// Fiche d'un groupe
// ---------------------------------------------------------------------------

export interface ProducerGroupMemberRow {
  rank: number;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  /** Seulement pour qui a le droit de lire les contacts (farmer.contact.read). */
  phone: string | null;
  communeName: string;
  departementName: string;
  areaHa: number;
  productionT: number;
  yieldTPerHa: number | null;
  verified: boolean;
  /** Accord WhatsApp en cours aujourd'hui (pas au moment de la formation). */
  whatsappConsent: boolean;
  /** Fiche de démonstration : aucun message ne part hors de l'application. */
  demo: boolean;
  /** Parcelle de la culture et de la campagne du groupe, à ouvrir sur la carte. */
  parcelId: string | null;
}

export interface ProducerGroupFigures {
  members: number;
  productionT: number;
  areaHa: number;
  /** Production totale ÷ surface totale ; null sans surface. */
  meanYieldTPerHa: number | null;
  consented: number;
  /** Consentants dont la fiche est de démonstration. */
  demo: number;
}

export interface ProducerGroupMessageItem {
  id: string;
  text: string;
  createdAt: Date;
  sentByName: string;
  recipients: number;
  sent: number;
  pending: number;
  /** Non envoyés : fiche de démonstration, accord retiré, numéro absent ou refusé. */
  notSent: number;
}

export interface ProducerGroupDetail {
  id: string;
  name: string;
  cropCode: string;
  cropName: string;
  campaignCode: string;
  departementName: string | null;
  communeName: string | null;
  criteria: ProducerGroupCriteria;
  createdAt: Date;
  createdByName: string;
  archivedAt: Date | null;
  figures: ProducerGroupFigures;
  members: ProducerGroupMemberRow[];
  messages: ProducerGroupMessageItem[];
}

async function messageDeliveries(
  messages: ReadonlyArray<{ id: string }>,
  farmerIds: readonly string[],
): Promise<Map<string, { sent: number; pending: number; notSent: number }>> {
  const counts = new Map(messages.map((m) => [m.id, { sent: 0, pending: 0, notSent: 0 }]));
  if (messages.length === 0 || farmerIds.length === 0) return counts;
  const subjects = new Map<string, string>();
  for (const message of messages) {
    for (const farmerId of farmerIds) {
      subjects.set(groupMessageSubjectId(message.id, farmerId), message.id);
    }
  }
  const rows = await prisma.farmerNotification.findMany({
    where: { kind: "GROUP_MESSAGE", subjectId: { in: [...subjects.keys()] } },
    select: { subjectId: true, status: true },
  });
  for (const row of rows) {
    const messageId = subjects.get(row.subjectId);
    const count = messageId ? counts.get(messageId) : undefined;
    if (!count) continue;
    if (row.status === "SENT" || row.status === "DELIVERED" || row.status === "READ") {
      count.sent += 1;
    } else if (row.status === "PENDING") count.pending += 1;
    else count.notSent += 1;
  }
  return counts;
}

async function loadGroup(actor: Actor, id: string): Promise<ProducerGroupDetail | null> {
  if (!idSchema.safeParse(id).success) return null;
  const group = await prisma.producerGroup.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      cropId: true,
      campaignId: true,
      criteria: true,
      createdAt: true,
      archivedAt: true,
      crop: { select: { code: true, nameFr: true } },
      campaign: { select: { code: true } },
      departement: { select: { name: true } },
      createdBy: { select: { name: true } },
      members: {
        orderBy: { rank: "asc" },
        select: {
          rank: true,
          farmerId: true,
          producedKg: true,
          areaHa: true,
          yieldTPerHa: true,
          verified: true,
          farmer: {
            select: {
              code: true,
              firstName: true,
              lastName: true,
              phoneE164: true,
              reliability: true,
              archivedAt: true,
              commune: { select: { name: true, departement: { select: { name: true } } } },
              channelConsents: {
                where: { channel: "WHATSAPP", granted: true, revokedAt: null },
                select: { id: true },
              },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: MAX_LISTED_MESSAGES,
        select: {
          id: true,
          text: true,
          createdAt: true,
          recipients: true,
          sentBy: { select: { name: true } },
        },
      },
    },
  });
  if (!group) return null;

  const farmerIds = group.members.map((m) => m.farmerId);
  const criteria = criteriaOf(group.criteria);
  const [parcels, deliveries, commune] = await Promise.all([
    readMemberParcels(group.cropId, group.campaignId, farmerIds),
    messageDeliveries(group.messages, farmerIds),
    criteria.communeCode
      ? prisma.commune.findUnique({ where: { code: criteria.communeCode }, select: { name: true } })
      : null,
  ]);
  const canReadContacts = authorize(actor, "farmer.contact.read", {}).allowed;

  const members: ProducerGroupMemberRow[] = group.members.map((m) => {
    const productionT = Number(m.producedKg) / 1000;
    const areaHa = Number(m.areaHa);
    return {
      rank: m.rank,
      farmerId: m.farmerId,
      farmerCode: m.farmer.code,
      farmerName: `${m.farmer.firstName} ${m.farmer.lastName}`,
      phone: canReadContacts ? m.farmer.phoneE164 : null,
      communeName: m.farmer.commune.name,
      departementName: m.farmer.commune.departement.name,
      areaHa,
      productionT,
      yieldTPerHa: m.yieldTPerHa === null ? null : Number(m.yieldTPerHa),
      verified: m.verified,
      // Une fiche archivée ne reçoit plus rien, quel que soit son accord.
      whatsappConsent: m.farmer.archivedAt === null && m.farmer.channelConsents.length > 0,
      demo: m.farmer.reliability === "SYNTHETIC",
      parcelId: parcels.get(m.farmerId) ?? null,
    };
  });
  const productionT = members.reduce((sum, m) => sum + m.productionT, 0);
  const areaHa = members.reduce((sum, m) => sum + m.areaHa, 0);
  const consenting = members.filter((m) => m.whatsappConsent);

  return {
    id: group.id,
    name: group.name,
    cropCode: group.crop.code,
    cropName: group.crop.nameFr,
    campaignCode: group.campaign.code,
    departementName: group.departement?.name ?? null,
    communeName: commune?.name ?? null,
    criteria,
    createdAt: group.createdAt,
    createdByName: group.createdBy.name,
    archivedAt: group.archivedAt,
    figures: {
      members: members.length,
      productionT,
      areaHa,
      meanYieldTPerHa: areaHa > 0 ? productionT / areaHa : null,
      consented: consenting.length,
      demo: consenting.filter((m) => m.demo).length,
    },
    members,
    messages: group.messages.map((message) => ({
      id: message.id,
      text: message.text,
      createdAt: message.createdAt,
      sentByName: message.sentBy.name,
      recipients: message.recipients,
      ...(deliveries.get(message.id) ?? { sent: 0, pending: 0, notSent: 0 }),
    })),
  };
}

/** Fiche d'un groupe avec sa liste nominative ; null s'il n'existe pas. Lecture journalisée. */
export async function getGroup(actor: Actor, id: string): Promise<ProducerGroupDetail | null> {
  requireRankingRight(actor);
  const group = await loadGroup(actor, id);
  if (!group) return null;
  await recordAudit({
    action: "group.read",
    actorId: actor.userId,
    resourceType: "producerGroup",
    resourceId: group.id,
    details: { groupId: group.id, rows: group.members.length },
  });
  return group;
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  "rang",
  "code_producteur",
  "producteur",
  "telephone",
  "commune",
  "departement",
  "surface_ha",
  "production_t",
  "rendement_t_ha",
  "exploitations_verifiees",
  "accord_whatsapp",
  "parcelle",
] as const;

export async function exportGroupCsv(
  actor: Actor,
  id: string,
): Promise<{ filename: string; content: string } | null> {
  requireRankingRight(actor);
  const group = await loadGroup(actor, id);
  if (!group) return null;
  await recordAudit({
    action: "group.exported",
    actorId: actor.userId,
    resourceType: "producerGroup",
    resourceId: group.id,
    details: { groupId: group.id, rows: group.members.length },
  });
  const content = formatCsv(
    CSV_HEADERS,
    group.members.map((m) => [
      m.rank,
      m.farmerCode,
      m.farmerName,
      m.phone,
      m.communeName,
      m.departementName,
      decimal(m.areaHa, 3),
      decimal(m.productionT, 3),
      decimal(m.yieldTPerHa, 2),
      m.verified ? "oui" : "non",
      m.whatsappConsent ? "oui" : "non",
      m.parcelId,
    ]),
  );
  const filename = `groupe-${group.cropCode.toLowerCase()}-${group.campaignCode}-${group.id.slice(-8)}.csv`;
  return { filename, content };
}

// ---------------------------------------------------------------------------
// Message WhatsApp aux membres
// ---------------------------------------------------------------------------

/**
 * Met en file un message par membre qui a donné son accord WhatsApp ; l'envoi suit la file des
 * messages de suivi (accord revérifié à l'envoi, silence de nuit, fiches de démonstration jamais
 * envoyées). Renvoie les identifiants à envoyer tout de suite.
 */
export async function sendGroupMessage(
  actor: Actor,
  groupId: string,
  text: string,
  now = new Date(),
): Promise<SendGroupMessageResult> {
  if (!authorize(actor, "ranking.read").allowed) return { ok: false, code: "FORBIDDEN" };
  const check = checkGroupMessage(text);
  if (!check.ok) return { ok: false, code: check.code };
  if (!idSchema.safeParse(groupId).success) return { ok: false, code: "NOT_FOUND" };

  const group = await prisma.producerGroup.findUnique({
    where: { id: groupId },
    select: {
      archivedAt: true,
      members: {
        orderBy: { rank: "asc" },
        select: {
          farmerId: true,
          farmer: {
            select: {
              reliability: true,
              archivedAt: true,
              channelConsents: {
                where: { channel: "WHATSAPP", granted: true, revokedAt: null },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!group) return { ok: false, code: "NOT_FOUND" };
  if (group.archivedAt) return { ok: false, code: "ARCHIVED" };
  const consenting = group.members.filter(
    (m) => m.farmer.archivedAt === null && m.farmer.channelConsents.length > 0,
  );
  if (consenting.length === 0) return { ok: false, code: "NO_RECIPIENT" };
  const recent = await prisma.producerGroupMessage.findFirst({
    where: {
      groupId,
      text: check.text,
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recent) return { ok: false, code: "DUPLICATE" };

  const { messageId, notificationIds } = await prisma.$transaction(async (tx) => {
    const message = await tx.producerGroupMessage.create({
      data: {
        groupId,
        text: check.text,
        recipients: consenting.length,
        sentById: actor.userId,
        createdAt: now,
      },
      select: { id: true },
    });
    const ids = await queueFarmerNotifications(
      tx,
      consenting.map((m) => ({
        kind: "GROUP_MESSAGE" as const,
        subjectId: groupMessageSubjectId(message.id, m.farmerId),
        farmerId: m.farmerId,
        text: groupMessageText(check.text),
      })),
      now,
    );
    return { messageId: message.id, notificationIds: ids };
  });
  const demo = consenting.filter((m) => m.farmer.reliability === "SYNTHETIC").length;
  await recordAudit({
    action: "group.messaged",
    actorId: actor.userId,
    resourceType: "producerGroup",
    resourceId: groupId,
    details: {
      groupId,
      messageId,
      members: group.members.length,
      consented: consenting.length,
      demo,
      queued: notificationIds.length,
      length: check.text.length,
    },
  });
  return {
    ok: true,
    messageId,
    members: group.members.length,
    consented: consenting.length,
    demo,
    queued: notificationIds.length,
    notificationIds,
  };
}

// ---------------------------------------------------------------------------
// Archivage
// ---------------------------------------------------------------------------

/** Archive un groupe : il reste consultable, ne reçoit plus de message et quitte la liste active. */
export async function archiveGroup(
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<ArchiveGroupResult> {
  if (!authorize(actor, "ranking.read").allowed) return { ok: false, code: "FORBIDDEN" };
  if (!idSchema.safeParse(id).success) return { ok: false, code: "NOT_FOUND" };
  const updated = await prisma.producerGroup.updateMany({
    where: { id, archivedAt: null },
    data: { archivedAt: now },
  });
  if (updated.count === 0) return { ok: false, code: "NOT_FOUND" };
  await recordAudit({
    action: "group.archived",
    actorId: actor.userId,
    resourceType: "producerGroup",
    resourceId: id,
  });
  return { ok: true };
}
