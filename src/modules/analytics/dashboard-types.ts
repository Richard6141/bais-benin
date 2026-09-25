import { z } from "zod";
import { VERIFICATION_STATUSES } from "@/database/sql/territory-stats.sql";
import type { StatsReliability } from "./territory-stats";

// Types publics du tableau de bord national (docs/modules/pilotage-parcours-ux.md). Contrat
// stable pour les pages : toute valeur chiffrée peut être `null`, soit parce que la ligne est
// masquée (`masked: true`, moins de 5 exploitations), soit parce que la donnée n'existe pas
// (aucune récolte déclarée, rendement sans surface). Une ligne à zéro exploitation n'est
// jamais masquée : elle se lit « aucune exploitation ».

export const dashboardFiltersSchema = z.object({
  /** Campagne « AAAA-AAAA » ; par défaut la campagne ouverte, sinon la dernière close. */
  campaignCode: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Code de campagne attendu au format AAAA-AAAA")
    .optional(),
  cropCode: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Code de culture invalide")
    .optional(),
  departementCode: z
    .string()
    .trim()
    .regex(/^BJ-[A-Z]{2}$/, "Code de département attendu au format BJ-XX")
    .optional(),
  communeCode: z
    .string()
    .trim()
    .regex(/^BJ-[A-Z]{3}-\d{3}$/, "Code de commune attendu au format BJ-XXX-000")
    .optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export interface CampaignRef {
  code: string;
  status: "PLANNED" | "OPEN" | "CLOSED";
  /** Dates AAAA-MM-JJ. */
  startsOn: string;
  endsOn: string;
}

export interface AnalyticsProvenance {
  source: "registre BAIS";
  /** Dernier rafraîchissement des agrégats lus (vues matérialisées) ; null si jamais rafraîchis. */
  refreshedAt: Date | null;
  /** Heure de la réponse. */
  generatedAt: Date;
  /** FIELD_VERIFIED au-delà de 80 % d'exploitations vérifiées, sinon DECLARED. */
  reliability: StatsReliability;
  /** Part d'exploitations vérifiées (agent ou terrain) de l'ensemble résumé, de 0 à 1. */
  verifiedShare: number | null;
  farmCount: number | null;
  /** Vrai tant que le registre est surtout synthétique : bandeau « Données de démonstration ». */
  synthetic: boolean;
}

/**
 * Chiffres du registre sur un périmètre (tuiles A2, fiche commune C1).
 * Sans filtre de culture : exploitations et superficies du registre, indépendantes de la
 * campagne ; avec un filtre de culture : exploitations qui portent la culture dans la campagne,
 * superficie déclarée de la culture.
 */
export interface RegistryFigures {
  masked: boolean;
  farmCount: number | null;
  /** Producteurs titulaires d'au moins une exploitation active du périmètre (compte direct). */
  farmerCount: number | null;
  declaredAreaHa: number | null;
  /** Superficie relevée (contours GPS) des parcelles. */
  measuredAreaHa: number | null;
  /** Part des parcelles relevées, de 0 à 1. */
  measuredParcelShare: number | null;
  verifiedShare: number | null;
  reliability: StatsReliability | null;
  /** Superficie déclarée des cultures de la campagne (base des comparaisons entre campagnes). */
  cropAreaHa: number | null;
  /** Production déclarée en tonnes ; null si aucune récolte n'est déclarée (« non déclarée »). */
  productionT: number | null;
  declaredHarvestCount: number | null;
}

export interface PreviousCampaignFigures {
  campaign: CampaignRef;
  masked: boolean;
  /** Seulement avec un filtre de culture (sinon l'effectif ne dépend pas de la campagne). */
  farmCount: number | null;
  cropAreaHa: number | null;
  productionT: number | null;
}

export interface DashboardOverview {
  filters: DashboardFilters & { campaignCode: string };
  campaign: CampaignRef;
  figures: RegistryFigures;
  /** Même périmètre, campagne précédente : base des tendances (« contre 2025-2026 »). */
  previous: PreviousCampaignFigures | null;
  provenance: AnalyticsProvenance;
}

export interface CropProductionRow {
  cropCode: string;
  cropName: string;
  colorHex: string | null;
  masked: boolean;
  farmCount: number | null;
  areaHa: number | null;
  /**
   * Superficie relevée des parcelles qui portent la culture : une parcelle en association compte
   * pour chacune de ses cultures, cette valeur ne s'additionne donc pas entre cultures.
   */
  measuredAreaHa: number | null;
  /** Superficie des cultures qui ont au moins une récolte déclarée : dénominateur du rendement. */
  harvestedAreaHa: number | null;
  productionT: number | null;
  declaredHarvestCount: number | null;
  /** Production déclarée ÷ superficie récoltée déclarée, en t/ha. */
  yieldTPerHa: number | null;
  /** Rendement de référence du référentiel des cultures. */
  typicalYieldTPerHa: number | null;
  /** Écart au rendement de référence, en % (négatif = en dessous). */
  yieldGapPct: number | null;
  verifiedShare: number | null;
  reliability: StatsReliability | null;
}

export interface CropProduction {
  filters: DashboardFilters & { campaignCode: string };
  campaign: CampaignRef;
  /** Triées par production décroissante, puis superficie. */
  rows: CropProductionRow[];
  /**
   * Totaux additifs entre cultures : superficie déclarée des cultures et production. Ni effectif
   * d'exploitations ni superficie relevée, qui compteraient deux fois les associations.
   */
  total: { areaHa: number; productionT: number | null };
  provenance: AnalyticsProvenance;
}

export interface CampaignPoint {
  campaignCode: string;
  masked: boolean;
  farmCount: number | null;
  areaHa: number | null;
  productionT: number | null;
  /** Variation en % contre la campagne précédente de la série ; null sans base comparable. */
  areaChangePct: number | null;
  productionChangePct: number | null;
}

export interface CampaignComparison {
  filters: Omit<DashboardFilters, "campaignCode">;
  /** Au plus 3 campagnes ouvertes ou closes, de la plus ancienne à la plus récente. */
  campaigns: CampaignRef[];
  /** Les 5 cultures principales (superficie de la dernière campagne), ou la culture filtrée. */
  crops: Array<{
    cropCode: string;
    cropName: string;
    colorHex: string | null;
    points: CampaignPoint[];
  }>;
  provenance: AnalyticsProvenance;
}

export type RankingSortKey =
  "farmCount" | "declaredAreaHa" | "measuredAreaHa" | "verifiedShare" | "productionT";

export interface TerritoryRankingRow {
  code: string;
  name: string;
  departementCode: string;
  /** Zone agro-écologique (communes seulement). */
  zoneCode: string | null;
  masked: boolean;
  farmCount: number | null;
  farmerCount: number | null;
  declaredAreaHa: number | null;
  measuredAreaHa: number | null;
  measuredParcelShare: number | null;
  verifiedShare: number | null;
  productionT: number | null;
  reliability: StatsReliability | null;
  /** Rang selon la clé de tri parmi les lignes visibles ; null si masquée ou sans exploitation. */
  rank: number | null;
}

export interface TerritoryRanking {
  level: "departement" | "commune";
  filters: DashboardFilters & { campaignCode: string };
  campaign: CampaignRef;
  sortBy: RankingSortKey;
  rows: TerritoryRankingRow[];
  /** Ligne de pied : « Bénin » pour les départements, le département pour ses communes. */
  total: TerritoryRankingRow;
  provenance: AnalyticsProvenance;
}

export interface FieldCoverage {
  agentCount: number;
  visits90d: number;
  /** Agents nommés pour le ministère ; « Agent 1 », « Agent 2 »… pour les autres périmètres. */
  agents: Array<{ label: string; visits90d: number; lastSyncAt: Date | null }>;
}

export interface CommuneProfile {
  commune: {
    code: string;
    name: string;
    departementCode: string;
    departementName: string;
    zoneCode: string | null;
    zoneName: string | null;
    ruralPopulation: number | null;
    areaKm2: number | null;
  };
  filters: DashboardFilters & { campaignCode: string };
  campaign: CampaignRef;
  figures: RegistryFigures;
  /** Comparaisons (ministère seulement, sinon null) : rapports d'exploitations aux moyennes. */
  comparison: {
    departementAverageFarmCount: number;
    nationalAverageFarmCount: number;
    /** 1,4 = « 1,4 fois la moyenne départementale ». */
    farmCountVsDepartement: number | null;
    farmCountVsNational: number | null;
  } | null;
  /** Producteurs enregistrés rapportés à la population rurale ; null sans population connue. */
  registeredFarmerShare: number | null;
  crops: CropProductionRow[];
  fieldCoverage: FieldCoverage;
  provenance: AnalyticsProvenance;
}

export class AnalyticsError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "AnalyticsError";
  }
}
