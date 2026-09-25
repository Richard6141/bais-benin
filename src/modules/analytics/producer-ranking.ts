import { z } from "zod";
import { readCampaigns, type CampaignRow } from "@/database/sql/dashboard.sql";
import {
  readProducerRanking,
  type ProducerRankingSqlRow,
} from "@/database/sql/producer-ranking.sql";
import { authorize, type Actor } from "@/modules/authorization";
import { recordAudit } from "@/modules/audit";
import { toCampaignRef } from "./aggregate";
import { decimal, formatCsv } from "./csv";
import { AnalyticsError, type CampaignRef } from "./dashboard-types";

// Palmarès des producteurs (ADR-0018) : « les 100 meilleurs producteurs de coton en 2024 dans le
// Borgou ». Données nominatives, donc exception volontaire au masquage des petits effectifs :
// ministère seulement (droit ranking.read), chaque consultation et chaque export sont journalisés.
// Par défaut seules les exploitations vérifiées (agent ou terrain) comptent, pour que la prime aille
// au meilleur producteur et non au meilleur déclarant.

export const DEFAULT_RANKING_CROP = "COTTON";
export const DEFAULT_RANKING_LIMIT = 100;
export const MAX_RANKING_LIMIT = 500;
export const MIN_AREA_FOR_YIELD_HA = 0.5;

const filtersSchema = z.object({
  cropCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/)
    .default(DEFAULT_RANKING_CROP),
  campaignCode: z
    .string()
    .regex(/^\d{4}-\d{4}$/)
    .optional(),
  departementCode: z
    .string()
    .regex(/^BJ-[A-Z]{2}$/)
    .optional(),
  communeCode: z
    .string()
    .regex(/^BJ-[A-Z]{3}-\d{3}$/)
    .optional(),
  metric: z.enum(["production", "yield"]).default("production"),
  // Vérifiées seulement tant que « 0 » ou « false » n'est pas demandé explicitement.
  verifiedOnly: z
    .union([z.boolean(), z.string()])
    .transform((v) => v !== false && v !== "0" && v !== "false")
    .default(true),
  limit: z.coerce.number().int().min(1).max(MAX_RANKING_LIMIT).default(DEFAULT_RANKING_LIMIT),
});

export type ProducerRankingFilters = Omit<z.infer<typeof filtersSchema>, "campaignCode"> & {
  campaignCode?: string;
};

/** Filtres lus depuis une adresse ou un formulaire ; toute valeur invalide est ignorée. */
export function parseProducerRankingFilters(
  input: Record<string, unknown>,
): ProducerRankingFilters {
  const clean = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
  const parsed = filtersSchema.safeParse(clean);
  if (parsed.success) return parsed.data;
  // Champ par champ : un paramètre fautif ne fait pas tomber les autres.
  const fallback: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clean)) {
    const field = filtersSchema.shape[key as keyof typeof filtersSchema.shape];
    if (field && field.safeParse(value).success) fallback[key] = value;
  }
  return filtersSchema.parse(fallback);
}

/** Campagne demandée, sinon la dernière close : c'est elle qui porte des récoltes complètes. */
export function rankingCampaign(campaigns: readonly CampaignRow[], code?: string): CampaignRow {
  if (code) {
    const found = campaigns.find((c) => c.code === code);
    if (!found) throw new AnalyticsError("NOT_FOUND", `Campagne inconnue : ${code}`);
    return found;
  }
  const closed = campaigns.filter((c) => c.status === "CLOSED");
  const fallback = closed.at(-1) ?? campaigns.filter((c) => c.status !== "PLANNED").at(-1);
  if (!fallback) throw new AnalyticsError("NOT_FOUND", "Aucune campagne agricole enregistrée");
  return fallback;
}

export interface ProducerRankingRow {
  rank: number;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  phone: string | null;
  communeCode: string;
  communeName: string;
  departementName: string;
  farmCount: number;
  areaHa: number;
  productionT: number;
  yieldTPerHa: number | null;
  verified: boolean;
}

export interface ProducerRanking {
  filters: ProducerRankingFilters & { campaignCode: string };
  campaign: CampaignRef;
  /** Producteurs classables avec ces filtres, avant la limite. */
  eligibleCount: number;
  rows: ProducerRankingRow[];
}

function toRow(row: ProducerRankingSqlRow, canReadContacts: boolean): ProducerRankingRow {
  return {
    rank: row.rank,
    farmerId: row.farmer_id,
    farmerCode: row.farmer_code,
    farmerName: `${row.first_name} ${row.last_name}`,
    phone: canReadContacts ? row.phone : null,
    communeCode: row.commune_code,
    communeName: row.commune_name,
    departementName: row.departement_name,
    farmCount: row.farm_count,
    areaHa: row.area_ha,
    productionT: row.production_kg / 1000,
    yieldTPerHa: row.area_ha > 0 ? row.production_kg / 1000 / row.area_ha : null,
    verified: row.all_verified,
  };
}

async function buildRanking(
  actor: Actor,
  input: Record<string, unknown>,
): Promise<ProducerRanking> {
  if (!authorize(actor, "ranking.read").allowed) {
    throw new AnalyticsError("FORBIDDEN", "Palmarès des producteurs réservé au ministère");
  }
  const filters = parseProducerRankingFilters(input);
  const campaign = rankingCampaign(await readCampaigns(), filters.campaignCode);
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
  const canReadContacts = authorize(actor, "farmer.contact.read", {}).allowed;
  return {
    filters: { ...filters, campaignCode: campaign.code },
    campaign: toCampaignRef(campaign),
    eligibleCount: rows[0]?.eligible_count ?? 0,
    rows: rows.map((row) => toRow(row, canReadContacts)),
  };
}

export async function getProducerRanking(
  actor: Actor,
  input: Record<string, unknown>,
): Promise<ProducerRanking> {
  const ranking = await buildRanking(actor, input);
  await recordAudit({
    action: "analytics.ranking.read",
    actorId: actor.userId,
    details: { filters: ranking.filters, rows: ranking.rows.length },
  });
  return ranking;
}

const CSV_HEADERS = [
  "rang",
  "code_producteur",
  "producteur",
  "telephone",
  "commune",
  "departement",
  "exploitations",
  "surface_ha",
  "production_t",
  "rendement_t_ha",
  "exploitations_verifiees",
] as const;

export async function exportProducerRankingCsv(
  actor: Actor,
  input: Record<string, unknown>,
): Promise<{ filename: string; content: string }> {
  const ranking = await buildRanking(actor, input);
  await recordAudit({
    action: "analytics.ranking.export",
    actorId: actor.userId,
    details: { filters: ranking.filters, rows: ranking.rows.length },
  });
  const content = formatCsv(
    CSV_HEADERS,
    ranking.rows.map((r) => [
      r.rank,
      r.farmerCode,
      r.farmerName,
      r.phone,
      r.communeName,
      r.departementName,
      r.farmCount,
      decimal(r.areaHa, 3),
      decimal(r.productionT, 3),
      decimal(r.yieldTPerHa, 2),
      r.verified ? "oui" : "non",
    ]),
  );
  const { cropCode, campaignCode } = ranking.filters;
  return { filename: `palmares-${cropCode.toLowerCase()}-${campaignCode}.csv`, content };
}
