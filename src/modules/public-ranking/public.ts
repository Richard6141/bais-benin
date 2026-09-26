import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";

// Lecture publique des palmarès (page /palmares, sans connexion). Seuls les palmarès non retirés
// sont servis, et dans chacun seuls les lauréats dont l'accord est toujours en cours : un accord
// retiré après la publication efface aussitôt le nom, même si la ligne existait encore.

const visibleEntry: Prisma.PublishedRankingEntryWhereInput = {
  farmer: { archivedAt: null, rankingConsent: { is: { revokedAt: null } } },
};

export interface PublicLaureate {
  rank: number;
  name: string;
  communeName: string;
  departementName: string;
  productionT: number;
  yieldTPerHa: number | null;
}

export interface PublicRankingSummary {
  id: string;
  title: string;
  campaignCode: string;
  metric: "production" | "yield";
  publishedAt: Date;
  laureates: number;
  podium: PublicLaureate[];
}

export interface PublicRanking extends Omit<PublicRankingSummary, "podium" | "laureates"> {
  entries: PublicLaureate[];
}

type EntryRow = {
  rank: number;
  displayName: string;
  communeName: string;
  departementName: string;
  productionT: Prisma.Decimal;
  areaHa: Prisma.Decimal;
};

const entrySelect = {
  rank: true,
  displayName: true,
  communeName: true,
  departementName: true,
  productionT: true,
  areaHa: true,
} as const;

function toLaureate(row: EntryRow): PublicLaureate {
  const productionT = Number(row.productionT);
  const areaHa = Number(row.areaHa);
  return {
    rank: row.rank,
    name: row.displayName,
    communeName: row.communeName,
    departementName: row.departementName,
    productionT,
    yieldTPerHa: areaHa > 0 ? productionT / areaHa : null,
  };
}

function metricOf(value: string): "production" | "yield" {
  return value === "yield" ? "yield" : "production";
}

export async function listPublicRankings(): Promise<PublicRankingSummary[]> {
  const rows = await prisma.publishedRanking.findMany({
    where: { withdrawnAt: null },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      campaignCode: true,
      metric: true,
      publishedAt: true,
      entries: { where: visibleEntry, orderBy: { rank: "asc" }, select: entrySelect },
    },
  });
  return rows
    .filter((row) => row.entries.length > 0)
    .map((row) => ({
      id: row.id,
      title: row.title,
      campaignCode: row.campaignCode,
      metric: metricOf(row.metric),
      publishedAt: row.publishedAt,
      laureates: row.entries.length,
      podium: row.entries.slice(0, 3).map(toLaureate),
    }));
}

export async function getPublicRanking(id: string): Promise<PublicRanking | null> {
  const row = await prisma.publishedRanking.findFirst({
    where: { id, withdrawnAt: null },
    select: {
      id: true,
      title: true,
      campaignCode: true,
      metric: true,
      publishedAt: true,
      entries: { where: visibleEntry, orderBy: { rank: "asc" }, select: entrySelect },
    },
  });
  if (!row || row.entries.length === 0) return null;
  return {
    id: row.id,
    title: row.title,
    campaignCode: row.campaignCode,
    metric: metricOf(row.metric),
    publishedAt: row.publishedAt,
    entries: row.entries.map(toLaureate),
  };
}
