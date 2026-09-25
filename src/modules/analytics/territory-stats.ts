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
import { maskSingle, maskSmallCells, type MaskedRow } from "./k-anonymity";

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

// B3 : cette API est publique (aucune session requise, cf. route.ts). Les champs listés dans
// MASKED_STATS_FIELDS sont donc masqués par k-anonymat (maskSmallCells, k=5) dès qu'une ligne
// résume moins de 5 exploitations — jusqu'ici seuls les tableaux de pilotage internes
// (aggregate.ts, ranking.ts) en bénéficiaient. communeCode/communeName restent visibles : on
// révèle qu'une commune existe, jamais ses effectifs quand ils sont trop petits pour être
// anonymes. Risque résiduel documenté dans docs/architecture.md : croiser plusieurs appels
// avec des `verificationStatus` complémentaires peut reconstituer par différence un effectif
// masqué (attaque par différenciation), un k-anonymat par requête ne s'en protège pas.
const MASKED_STATS_FIELDS = [
  "farmCount",
  "farmerCount",
  "declaredAreaHa",
  "verifiedShare",
  "cropCodes",
  "reliability",
] as const;

type RawCommuneStats = {
  communeCode: string;
  communeName: string;
  departementCode: string;
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  cropCodes: string[];
  reliability: StatsReliability;
};

type RawDepartementStats = {
  departementCode: string;
  departementName: string;
  communeCount: number;
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  cropCodes: string[];
  reliability: StatsReliability;
};

type RawNationalStats = {
  farmCount: number;
  farmerCount: number;
  declaredAreaHa: number;
  verifiedShare: number;
  communeCountWithFarms: number;
};

export type CommuneStats = MaskedRow<RawCommuneStats, (typeof MASKED_STATS_FIELDS)[number]>;
export type DepartementStats = MaskedRow<RawDepartementStats, (typeof MASKED_STATS_FIELDS)[number]>;
export type NationalStats = MaskedRow<
  RawNationalStats,
  Exclude<(typeof MASKED_STATS_FIELDS)[number], "cropCodes" | "reliability">
>;

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

export function mapCommuneRow(row: CommuneStatsRow): RawCommuneStats {
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

export function mapDepartementRow(row: DepartementStatsRow): RawDepartementStats {
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

export function mapNationalRow(row: NationalStatsRow): RawNationalStats {
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
  const raw = (await communeStats(toSqlFilters(filters))).map(mapCommuneRow);
  // B3 : la provenance (part vérifiée, effectif total) reste calculée sur les données brutes —
  // c'est un total agrégé sur l'ensemble de la réponse, pas l'effectif d'une commune isolée —
  // tandis que chaque ligne exposée est masquée individuellement dès qu'elle résume moins de
  // K_ANONYMITY exploitations. groupTotal:true masque en plus la plus petite ligne visible
  // quand une seule est déjà masquée, pour qu'on ne puisse pas la retrouver par soustraction.
  const farmCount = raw.reduce((sum, item) => sum + item.farmCount, 0);
  const provenance = provenanceFor(weightedVerifiedShare(raw), farmCount, now);
  const items = maskSmallCells(raw, {
    count: (row) => row.farmCount,
    fields: MASKED_STATS_FIELDS,
    groupTotal: true,
  });
  return { items, filters, provenance };
}

export async function getDepartementStats(
  input: StatsFilters = {},
  now = new Date(),
): Promise<StatsResponse<DepartementStats>> {
  const filters = statsFiltersSchema.parse(input);
  const raw = (await departementStats(toSqlFilters(filters))).map(mapDepartementRow);
  const farmCount = raw.reduce((sum, item) => sum + item.farmCount, 0);
  const provenance = provenanceFor(weightedVerifiedShare(raw), farmCount, now);
  const items = maskSmallCells(raw, {
    count: (row) => row.farmCount,
    fields: MASKED_STATS_FIELDS,
    groupTotal: true,
  });
  return { items, filters, provenance };
}

export async function getNationalStats(
  input: StatsFilters = {},
  now = new Date(),
): Promise<NationalStats & { filters: StatsFilters; provenance: StatsProvenance }> {
  const filters = statsFiltersSchema.parse(input);
  const raw = mapNationalRow(await nationalStats(toSqlFilters(filters)));
  const provenance = provenanceFor(raw.verifiedShare, raw.farmCount, now);
  // B3 : un filtre suffisamment étroit (culture + campagne + commune + statut de vérification)
  // peut réduire même le total national à un petit nombre d'exploitations identifiable ; on
  // applique donc le même masquage qu'aux niveaux commune/département, sans total de groupe
  // (cette ligne EST le total).
  const stats = maskSingle(raw, {
    count: (row) => row.farmCount,
    fields: ["farmCount", "farmerCount", "declaredAreaHa", "verifiedShare"],
  });
  return { ...stats, filters, provenance };
}
