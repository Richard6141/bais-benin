import { z } from "zod";
import { prisma } from "@/database/client";
import { reserveProcessingRequest } from "@/database/sql/satellite.sql";
import {
  flaggedFarmsInScope,
  listVegetationCandidates,
  upsertVegetationCheck,
  vegetationChecksForFarms,
  vegetationSummary,
  type FarmScopeParams,
} from "@/database/sql/vegetation.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";
import {
  RemoteSensingProviderError,
  type PolygonGeometry,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import {
  evaluateVegetation,
  expectedProfile,
  seasonWindow,
  type VegetationCheckStatus,
} from "./crop-profiles";
import { processingBudget } from "./imagery";
import { periodOf } from "./periods";

// Confrontation déclaration / satellite (ADR-0016, étape 2) : pour chaque parcelle relevée, NDVI
// moyen par décade sur la saison de sa culture principale, calculé par Copernicus (une requête
// de l'API Statistical par parcelle et par saison, sous le plafond mensuel), jugé face au profil
// attendu de la culture. Lecture : le ministère voit la synthèse nationale en codes ; un agent ne
// voit que les parcelles des exploitations qu'il a enregistrées (ADR-0014).

const calendarWindow = z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]);
const calendarSchema = z.object({
  south: z.object({ sowing: calendarWindow.optional(), harvest: calendarWindow }).optional(),
  north: z.object({ sowing: calendarWindow.optional(), harvest: calendarWindow }).optional(),
});

const geometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

/** Une valeur par décade : assez fin pour voir la levée, assez large pour passer les nuages. */
const INTERVAL_DAYS = 10;
/** Une saison encore en cours ou masquée par les nuages est réexaminée après ce délai. */
const RETRY_AFTER_MS = 10 * 86_400_000;

export interface VegetationRunResult {
  campaignCode: string | null;
  examined: number;
  byStatus: Record<VegetationCheckStatus, number>;
  skipped: number;
  errors: number;
  budgetExhausted: boolean;
}

export async function runVegetationChecks(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
  campaignCode?: string;
}): Promise<VegetationRunResult> {
  const now = options.now ?? new Date();
  const result: VegetationRunResult = {
    campaignCode: null,
    examined: 0,
    byStatus: { CONSISTENT: 0, TO_VERIFY: 0, INSUFFICIENT_DATA: 0, PENDING: 0 },
    skipped: 0,
    errors: 0,
    budgetExhausted: false,
  };
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: options.campaignCode ? { code: options.campaignCode } : { status: "OPEN" },
    select: { id: true, code: true, startYear: true },
  });
  if (!campaign) return result;
  result.campaignCode = campaign.code;

  const candidates = await listVegetationCandidates({
    campaignId: campaign.id,
    retryBefore: new Date(now.getTime() - RETRY_AFTER_MS),
    limit: options.limit,
    replaceSynthetic: options.provider.provenance.sourceId !== "BAIS_SEED",
  });
  const budget = processingBudget();
  // Seul le vrai fournisseur consomme le quota Copernicus ; la fixture n'appelle personne.
  const metered = options.provider.id === "cdse";

  for (const candidate of candidates) {
    const calendar = calendarSchema.safeParse(candidate.crop_calendar);
    const geometry = geometrySchema.safeParse(JSON.parse(candidate.geometry));
    const crop = {
      code: candidate.crop_code,
      category: candidate.crop_category,
      cycle: candidate.crop_cycle,
      calendar: calendar.success ? calendar.data : {},
    };
    const window = seasonWindow(
      crop,
      candidate.rainfall_regime ?? "UNIMODAL",
      candidate.sub_season,
      campaign.startYear,
      now,
    );
    if (!geometry.success || !window || window.from.getTime() > now.getTime()) {
      result.skipped += 1;
      continue;
    }
    if (metered && !(await reserveProcessingRequest(periodOf(now), "STATISTICS", budget))) {
      result.budgetExhausted = true;
      break;
    }
    const to = window.to.getTime() < now.getTime() ? window.to : now;
    const profile = expectedProfile(crop, candidate.zone_code);
    let series;
    try {
      series = await options.provider.vegetationStatistics({
        geometry: geometry.data as PolygonGeometry,
        from: window.from.toISOString(),
        to: to.toISOString(),
        intervalDays: INTERVAL_DAYS,
        expectedCover: profile.kind,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, parcel: candidate.parcel_code }, "NDVI de parcelle indisponible");
      result.errors += 1;
      continue;
    }
    const verdict = evaluateVegetation(series, profile, window, now);
    await upsertVegetationCheck({
      parcelId: candidate.parcel_id,
      campaignId: campaign.id,
      subSeason: candidate.sub_season,
      cropId: candidate.crop_id,
      status: verdict.status,
      reason: verdict.reason,
      peakNdvi: verdict.peak,
      baseNdvi: verdict.base,
      expectedNdvi: verdict.expected,
      validIntervals: verdict.validIntervals,
      windowFrom: window.from,
      windowTo: to,
      series: series.map((interval) => ({
        from: interval.from.slice(0, 10),
        to: interval.to.slice(0, 10),
        ndvi: interval.ndviMean,
        valid: interval.validPixels,
      })),
      sourceId: options.provider.provenance.sourceId,
      reliability: options.provider.provenance.reliability,
    });
    result.examined += 1;
    result.byStatus[verdict.status] += 1;
  }
  return result;
}

export type VegetationSummary = Awaited<ReturnType<typeof vegetationSummary>> & {
  campaignCode: string;
};

/** Synthèse de la campagne ouverte pour le ministère (portée nationale sur le registre). */
export async function getVegetationSummary(
  actor: Actor,
  filters: { departementCode?: string } = {},
): Promise<VegetationSummary | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;
  const summary = await vegetationSummary({
    campaignId: campaign.id,
    departementCode: filters.departementCode,
    flaggedLimit: 50,
  });
  return { ...summary, campaignCode: campaign.code };
}

export interface ParcelVegetationCheck {
  parcelId: string;
  campaignCode: string;
  subSeason: string;
  cropName: string;
  status: VegetationCheckStatus;
  reason: string | null;
  peakNdvi: number | null;
  expectedNdvi: number;
  sourceId: string;
  computedAt: Date;
}

/** Verdicts des parcelles d'une exploitation, si l'acteur peut lire cette exploitation. */
export async function getFarmVegetationChecks(
  actor: Actor,
  farmId: string,
): Promise<ParcelVegetationCheck[]> {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: { communeId: true, registeredById: true, farmer: { select: { userId: true } } },
  });
  if (!farm) return [];
  const decision = authorize(actor, "farm.read", {
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    communeId: farm.communeId,
  });
  if (!decision.allowed) return [];
  const rows = await vegetationChecksForFarms([farmId]);
  return rows.map((row) => ({
    parcelId: row.parcel_id,
    campaignCode: row.campaign_code,
    subSeason: row.sub_season,
    cropName: row.crop_name,
    status: row.status,
    reason: row.reason,
    peakNdvi: row.peak_ndvi,
    expectedNdvi: row.expected_ndvi,
    sourceId: row.source_id,
    computedAt: row.computed_at,
  }));
}

/** Exploitations lisibles par l'acteur dont une parcelle est à vérifier (campagne ouverte). */
export async function listFlaggedFarms(actor: Actor, limit = 50) {
  const scope = scopeFilter(actor, "farm.read");
  const params: FarmScopeParams | null =
    scope.kind === "all"
      ? { all: true }
      : scope.kind === "registered"
        ? { registeredBy: scope.userId }
        : scope.kind === "self"
          ? { ownerUserId: scope.userId }
          : scope.kind === "territory"
            ? { communeIds: scope.communeIds, departementIds: scope.departementIds }
            : null;
  if (!params) return [];
  return flaggedFarmsInScope(params, limit);
}
