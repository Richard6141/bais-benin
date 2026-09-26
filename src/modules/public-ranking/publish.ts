import { prisma } from "@/database/client";
import { readCampaigns } from "@/database/sql/dashboard.sql";
import { readProducerRanking } from "@/database/sql/producer-ranking.sql";
import {
  MIN_AREA_FOR_YIELD_HA,
  parseProducerRankingFilters,
  rankingCampaign,
} from "@/modules/analytics";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";

// Publication d'un palmarès par le ministère (complément d'ADR-0018) : instantané des N premiers
// lauréats qui ont donné leur accord, pour les critères affichés sur /pilotage/palmares. Le rang
// publié est celui du classement complet : un rang absent est celui d'un producteur qui n'a pas
// donné son accord, jamais nommé. Ni téléphone ni NPI ne sont recopiés.

export const MAX_PUBLISHED_LAUREATES = 100;

export type PublishResult =
  | { ok: true; id: string; laureates: number }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "NO_CONSENTING" };

export type WithdrawResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" };

async function scopeLabel(departementCode?: string, communeCode?: string): Promise<string> {
  if (communeCode) {
    const commune = await prisma.commune.findUnique({
      where: { code: communeCode },
      select: { name: true },
    });
    return commune ? `commune de ${commune.name}` : communeCode;
  }
  if (departementCode) {
    const departement = await prisma.departement.findUnique({
      where: { code: departementCode },
      select: { name: true },
    });
    return departement ? `département ${departement.name}` : departementCode;
  }
  return "tout le Bénin";
}

export async function publishRanking(
  actor: Actor,
  input: Record<string, unknown>,
  laureates: number,
  now = new Date(),
): Promise<PublishResult> {
  if (!authorize(actor, "ranking.publish").allowed) return { ok: false, code: "FORBIDDEN" };
  if (!Number.isInteger(laureates) || laureates < 1 || laureates > MAX_PUBLISHED_LAUREATES) {
    return { ok: false, code: "INVALID" };
  }
  const filters = parseProducerRankingFilters(input);
  const campaigns = await readCampaigns();
  if (filters.campaignCode && !campaigns.some((c) => c.code === filters.campaignCode)) {
    return { ok: false, code: "INVALID" };
  }
  const campaign = rankingCampaign(campaigns, filters.campaignCode);
  const rows = await readProducerRanking({
    cropCode: filters.cropCode,
    campaignCode: campaign.code,
    departementCode: filters.departementCode,
    communeCode: filters.communeCode,
    metric: filters.metric,
    verifiedOnly: filters.verifiedOnly,
    minAreaHa: MIN_AREA_FOR_YIELD_HA,
    limit: laureates,
    consentingOnly: true,
  });
  if (rows.length === 0) return { ok: false, code: "NO_CONSENTING" };

  const crop = await prisma.crop.findUnique({
    where: { code: filters.cropCode },
    select: { nameFr: true },
  });
  const scope = await scopeLabel(filters.departementCode, filters.communeCode);
  const criterion = filters.metric === "yield" ? ", au rendement à l'hectare" : "";
  const title = `Palmarès ${(crop?.nameFr ?? filters.cropCode).toLowerCase()}, campagne ${campaign.code}, ${scope}${criterion}`;

  const published = await prisma.publishedRanking.create({
    data: {
      title,
      cropCode: filters.cropCode,
      campaignCode: campaign.code,
      departementCode: filters.departementCode ?? null,
      communeCode: filters.communeCode ?? null,
      metric: filters.metric,
      verifiedOnly: filters.verifiedOnly,
      requestedCount: laureates,
      publishedById: actor.userId,
      publishedAt: now,
      entries: {
        create: rows.map((row) => ({
          rank: row.rank,
          farmerId: row.farmer_id,
          displayName: `${row.first_name} ${row.last_name}`,
          communeName: row.commune_name,
          departementName: row.departement_name,
          productionT: (row.production_kg / 1000).toFixed(3),
          areaHa: row.area_ha.toFixed(3),
        })),
      },
    },
    select: { id: true },
  });
  await recordAudit({
    action: "analytics.ranking.published",
    actorId: actor.userId,
    resourceType: "publishedRanking",
    resourceId: published.id,
    details: {
      filters: { ...filters, campaignCode: campaign.code },
      requested: laureates,
      laureates: rows.length,
    },
  });
  return { ok: true, id: published.id, laureates: rows.length };
}

export async function withdrawRanking(
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<WithdrawResult> {
  if (!authorize(actor, "ranking.publish").allowed) return { ok: false, code: "FORBIDDEN" };
  // Les lauréats ne sont conservés que tant que le palmarès est publié (registre des
  // traitements) : le retrait les supprime ; l'en-tête du palmarès reste pour le ministère.
  const removed = await prisma.$transaction(async (tx) => {
    const updated = await tx.publishedRanking.updateMany({
      where: { id, withdrawnAt: null },
      data: { withdrawnAt: now, withdrawnById: actor.userId },
    });
    if (updated.count === 0) return null;
    return (await tx.publishedRankingEntry.deleteMany({ where: { rankingId: id } })).count;
  });
  if (removed === null) return { ok: false, code: "NOT_FOUND" };
  await recordAudit({
    action: "analytics.ranking.withdrawn",
    actorId: actor.userId,
    resourceType: "publishedRanking",
    resourceId: id,
    details: { laureatesRemoved: removed },
  });
  return { ok: true };
}

export interface PublishedRankingItem {
  id: string;
  title: string;
  publishedAt: Date;
  publishedByName: string;
  withdrawnAt: Date | null;
  laureates: number;
}

/** Palmarès publiés, retirés compris, pour le ministère ; rien pour un autre rôle. */
export async function listPublishedRankings(actor: Actor): Promise<PublishedRankingItem[]> {
  if (!authorize(actor, "ranking.publish").allowed) return [];
  const rows = await prisma.publishedRanking.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      publishedAt: true,
      withdrawnAt: true,
      publishedBy: { select: { name: true } },
      _count: { select: { entries: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt,
    publishedByName: row.publishedBy.name,
    withdrawnAt: row.withdrawnAt,
    laureates: row._count.entries,
  }));
}
