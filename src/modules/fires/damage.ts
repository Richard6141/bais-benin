import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { formatCsv } from "@/modules/analytics/csv";
import { recordAudit } from "@/modules/audit";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";
import { queueBurnAssessmentsForFarm } from "./burned-area";

// Déclarations de sinistre (ADR-0038 §2) : proposées par la mesure de surface brûlée, confirmées
// ou écartées sur place par l'agent qui a enregistré l'exploitation. Lues par le ministère (toutes),
// l'agent (ses exploitations) et le producteur (les siennes) ; exportées par le ministère pour les
// programmes d'assistance et les assureurs. Une pièce, jamais un paiement.

export class DamageError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "DamageError";
  }
}

/** Portée de lecture des déclarations, par l'exploitation. */
function damageScope(actor: Actor): Prisma.DamageDeclarationWhereInput | null {
  const filter = scopeFilter(actor, "damage.read");
  switch (filter.kind) {
    case "all":
      return {};
    case "none":
      return null;
    case "self":
      return { farm: { farmer: { userId: filter.userId } } };
    case "registered":
      return { farm: { registeredById: filter.userId } };
    case "territory": {
      const clauses: Prisma.FarmWhereInput[] = [];
      if (filter.communeIds.length > 0) clauses.push({ communeId: { in: filter.communeIds } });
      if (filter.departementIds.length > 0) {
        clauses.push({ commune: { departementId: { in: filter.departementIds } } });
      }
      if (filter.includeSelf) clauses.push({ farmer: { userId: actor.userId } });
      return clauses.length > 0 ? { farm: { OR: clauses } } : null;
    }
  }
}

const declarationSelect = {
  id: true,
  status: true,
  occurredAt: true,
  estimatedLowHa: true,
  estimatedHighHa: true,
  observedAreaHa: true,
  cropStage: true,
  note: true,
  rejectReason: true,
  reviewedAt: true,
  version: true,
  createdAt: true,
  crop: { select: { code: true, nameFr: true } },
  parcel: { select: { code: true } },
  farm: {
    select: {
      id: true,
      code: true,
      name: true,
      commune: { select: { name: true } },
      farmer: { select: { firstName: true, lastName: true } },
    },
  },
  burnAssessment: {
    select: { fireDistanceM: true, validShare: true, reliability: true, trigger: true },
  },
} satisfies Prisma.DamageDeclarationSelect;

export type DamageRow = Prisma.DamageDeclarationGetPayload<{ select: typeof declarationSelect }>;

export interface DamageFilters {
  status?: "PROPOSED" | "CONFIRMED" | "REJECTED";
  limit?: number;
}

/** Déclarations lisibles par l'acteur, les plus récentes d'abord ; vide hors de sa portée. */
export async function listDamageDeclarations(
  actor: Actor,
  filters: DamageFilters = {},
): Promise<DamageRow[]> {
  const scope = damageScope(actor);
  if (!scope) return [];
  return prisma.damageDeclaration.findMany({
    where: { AND: [scope, filters.status ? { status: filters.status } : {}] },
    select: declarationSelect,
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: filters.limit ?? 200,
  });
}

/** Une déclaration lisible par l'acteur ; null hors de sa portée ou inconnue. */
export async function getDamageDeclaration(actor: Actor, id: string): Promise<DamageRow | null> {
  const scope = damageScope(actor);
  if (!scope) return null;
  return prisma.damageDeclaration.findFirst({
    where: { AND: [scope, { id }] },
    select: declarationSelect,
  });
}

/** Déclarations à confirmer sur place, dans la portée de l'acteur. */
export async function countProposedDamages(actor: Actor): Promise<number> {
  const scope = damageScope(actor);
  if (!scope) return 0;
  return prisma.damageDeclaration.count({ where: { AND: [scope, { status: "PROPOSED" }] } });
}

const STATUS_LABELS = {
  PROPOSED: "À confirmer",
  CONFIRMED: "Confirmée",
  REJECTED: "Écartée",
} as const;

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Porto-Novo" });

/** Export CSV des déclarations (ministère seulement), lisible par Excel en français. */
export async function exportDamageCsv(
  actor: Actor,
  filters: DamageFilters = {},
): Promise<{ filename: string; content: string }> {
  if (!authorize(actor, "damage.export").allowed) {
    throw new DamageError("FORBIDDEN", "Export des sinistres réservé au ministère");
  }
  const rows = await listDamageDeclarations(actor, { ...filters, limit: 10_000 });
  const content = formatCsv(
    [
      "date_du_feu",
      "commune",
      "exploitation",
      "producteur",
      "parcelle",
      "estimation_basse_ha",
      "estimation_haute_ha",
      "etat",
      "surface_constatee_ha",
      "culture",
      "stade",
      "source",
      "revue_le",
    ],
    rows.map((row) => [
      day.format(row.occurredAt),
      row.farm.commune.name,
      row.farm.code,
      `${row.farm.farmer.firstName} ${row.farm.farmer.lastName}`,
      row.parcel.code,
      Number(row.estimatedLowHa),
      Number(row.estimatedHighHa),
      STATUS_LABELS[row.status],
      row.observedAreaHa === null ? null : Number(row.observedAreaHa),
      row.crop?.nameFr ?? null,
      row.cropStage,
      row.burnAssessment.reliability === "SYNTHETIC" ? "démonstration" : "satellite Sentinel-2",
      row.reviewedAt ? day.format(row.reviewedAt) : null,
    ]),
  );
  await recordAudit({
    action: "damage.exported",
    actorId: actor.userId,
    resourceType: "damage_declaration",
    details: { ...filters, rows: rows.length },
  });
  return { filename: `sinistres-feux-${new Date().toISOString().slice(0, 10)}.csv`, content };
}

/**
 * Demande la mesure de surface brûlée des parcelles d'une exploitation exposées à un feu des 30
 * derniers jours (agent qui l'a enregistrée, ou ministère). Renvoie le nombre de parcelles mises
 * en file ; zéro si aucune n'est exposée ou si elles le sont déjà.
 */
export async function requestBurnAssessment(actor: Actor, farmId: string): Promise<number> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: {
      id: true,
      communeId: true,
      registeredById: true,
      farmer: { select: { userId: true } },
      commune: { select: { departementId: true } },
    },
  });
  const allowed =
    farm &&
    authorize(actor, "burn.request", {
      communeId: farm.communeId,
      departementId: farm.commune.departementId,
      registeredByUserId: farm.registeredById,
      ownerUserId: farm.farmer.userId,
    }).allowed;
  if (!farm || !allowed) throw new DamageError("NOT_FOUND", "Exploitation introuvable");
  const queued = await queueBurnAssessmentsForFarm(farm.id, actor.userId);
  await recordAudit({
    action: "burn.requested",
    actorId: actor.userId,
    resourceType: "farm",
    resourceId: farm.id,
    details: { queued },
  });
  return queued;
}
