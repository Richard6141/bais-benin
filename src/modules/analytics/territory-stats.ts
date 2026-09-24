import { z } from "zod";
import {
  VERIFICATION_STATUSES,
  communeStats,
  departementStats,
  nationalStats,
  type CommuneStatsRow,
  type DepartementStatsRow,
  type NationalStatsRow,
  type TerritoryStatsFilters,
} from "@/database/sql/territory-stats.sql";

// Agrégats territoriaux exposés à la carte et au pilotage. Chaque réponse porte sa provenance
// (docs/01, principe 2) : la fiabilité d'un agrégat dépend de la part d'exploitations vérifiées
// qu'il résume. Le seuil de 80 % est celui au-delà duquel un indicateur est considéré comme
// établi sur le terrain plutôt que déclaratif.

export const statsFiltersSchema = z.object({
  cropCode: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Code de culture invalide")
    .optional(),
  campaignCode: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Code de campagne attendu au format AAAA-AAAA")
    .optional(),
  departementCode: z
    .string()
    .trim()
    .regex(/^BJ-[A-Z]{2}$/, "Code de département attendu au format BJ-XX")
    .optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
});

export type StatsFilters = z.infer<typeof statsFiltersSchema>;

export type StatsReliability = "FIELD_VERIFIED" | "DECLARED";

export interface StatsProvenance {
  source: "registre BAIS";
  generatedAt: Date;
  reliability: StatsReliability;
  /** Part d'exploitations vérifiées (agent ou terrain) sur l'ensemble résumé, de 0 à 1. */
  verifiedShare: number;
  farmCount: number;
}

export interface CommuneStats {
  communeCode: string;
  communeName: string;
  departementCode: string;
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  cropCodes: string[];
  reliability: StatsReliability;
}

export interface DepartementStats {
  departementCode: string;
  departementName: string;
  communeCount: number;
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  cropCodes: string[];
  reliability: StatsReliability;
}

export interface NationalStats {
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  communeCountWithFarms: number;
}

export interface StatsResponse<T> {
  items: T[];
  filters: StatsFilters;
  provenance: StatsProvenance;
}

export const VERIFIED_SHARE_THRESHOLD = 0.8;

export function reliabilityFromShare(verifiedShare: number): StatsReliability {
  return verifiedShare >= VERIFIED_SHARE_THRESHOLD ? "FIELD_VERIFIED" : "DECLARED";
}

/** Part vérifiée d'un ensemble de lignes, pondérée par le nombre d'exploitations. */
export function weightedVerifiedShare(
  rows: ReadonlyArray<{ farmCount: number; verifiedShare: number }>,
): number {
  const total = rows.reduce((sum, row) => sum + row.farmCount, 0);
  if (total === 0) return 0;
  const verified = rows.reduce((sum, row) => sum + row.farmCount * row.verifiedShare, 0);
  return Math.min(1, Math.max(0, verified / total));
}

function provenanceFor(verifiedShare: number, farmCount: number, now: Date): StatsProvenance {
  return {
    source: "registre BAIS",
    generatedAt: now,
    reliability: reliabilityFromShare(verifiedShare),
    verifiedShare,
    farmCount,
  };
}

export function mapCommuneRow(row: CommuneStatsRow): CommuneStats {
  return {
    communeCode: row.commune_code,
    communeName: row.commune_name,
    departementCode: row.departement_code,
    farmCount: row.farm_count,
    farmerCount: row.farmer_count,
    declaredAreaHa: row.declared_area_ha,
    verifiedShare: row.verified_share,
    cropCodes: [...row.crop_codes],
    reliability: reliabilityFromShare(row.verified_share),
  };
}

export function mapDepartementRow(row: DepartementStatsRow): DepartementStats {
  return {
    departementCode: row.departement_code,
    departementName: row.departement_name,
    communeCount: row.commune_count,
    farmCount: row.farm_count,
    farmerCount: row.farmer_count,
    declaredAreaHa: row.declared_area_ha,
    verifiedShare: row.verified_share,
    cropCodes: [...row.crop_codes],
    reliability: reliabilityFromShare(row.verified_share),
  };
}

export function mapNationalRow(row: NationalStatsRow): NationalStats {
  return {
    farmCount: row.farm_count,
    farmerCount: row.farmer_count,
    declaredAreaHa: row.declared_area_ha,
    verifiedShare: row.verified_share,
    communeCountWithFarms: row.commune_count_with_farms,
  };
}

function toSqlFilters(filters: StatsFilters): TerritoryStatsFilters {
  return {
    cropCode: filters.cropCode,
    campaignCode: filters.campaignCode,
    departementCode: filters.departementCode,
    verificationStatus: filters.verificationStatus,
  };
}

export async function getCommuneStats(
  input: StatsFilters = {},
  now = new Date(),
): Promise<StatsResponse<CommuneStats>> {
  const filters = statsFiltersSchema.parse(input);
  const items = (await communeStats(toSqlFilters(filters))).map(mapCommuneRow);
  const farmCount = items.reduce((sum, item) => sum + item.farmCount, 0);
  return {
    items,
    filters,
    provenance: provenanceFor(weightedVerifiedShare(items), farmCount, now),
  };
}

export async function getDepartementStats(
  input: StatsFilters = {},
  now = new Date(),
): Promise<StatsResponse<DepartementStats>> {
  const filters = statsFiltersSchema.parse(input);
  const items = (await departementStats(toSqlFilters(filters))).map(mapDepartementRow);
  const farmCount = items.reduce((sum, item) => sum + item.farmCount, 0);
  return {
    items,
    filters,
    provenance: provenanceFor(weightedVerifiedShare(items), farmCount, now),
  };
}

export async function getNationalStats(
  input: StatsFilters = {},
  now = new Date(),
): Promise<NationalStats & { filters: StatsFilters; provenance: StatsProvenance }> {
  const filters = statsFiltersSchema.parse(input);
  const stats = mapNationalRow(await nationalStats(toSqlFilters(filters)));
  return {
    ...stats,
    filters,
    provenance: provenanceFor(stats.verifiedShare, stats.farmCount, now),
  };
}
