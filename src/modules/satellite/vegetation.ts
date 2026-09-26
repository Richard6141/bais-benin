import { z } from "zod";
import { prisma } from "@/database/client";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
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
  evaluateRadar,
  evaluateVegetation,
  expectedProfile,
  expectedRadarProfile,
  seasonWindow,
  type VegetationCheckStatus,
  type VegetationVerdict,
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
/** Radar : une valeur par pas de 12 jours, un passage par orbite ; toujours le même sens. */
const RADAR_INTERVAL_DAYS = 12;
const RADAR_ORBIT = "DESCENDING" as const;
/** Échecs de Copernicus d'affilée au-delà desquels le lot quotidien s'arrête. */
const MAX_CONSECUTIVE_ERRORS = 5;
/** Une saison encore en cours ou masquée par les nuages est réexaminée après ce délai. */
const RETRY_AFTER_MS = 10 * 86_400_000;

export interface VegetationRunResult {
  campaignCode: string | null;
  examined: number;
  byStatus: Record<VegetationCheckStatus, number>;
  skipped: number;
  errors: number;
  budgetExhausted: boolean;
  /** Parcelles tranchées par le radar, faute de Sentinel-2 sous les nuages (ADR-0019). */
  radarDecided: number;
  /** Arrêt du lot : limite par minute atteinte ou Copernicus injoignable plusieurs fois de suite. */
  interrupted: "throttled" | "provider-unavailable" | null;
}

export async function runVegetationChecks(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
  campaignCode?: string;
  /** Radar quand Sentinel-2 n'a pas pu conclure ; par défaut SATELLITE_RADAR_FALLBACK. */
  radarFallback?: boolean;
}): Promise<VegetationRunResult> {
  const now = options.now ?? new Date();
  const radarFallback = options.radarFallback ?? getServerEnv().SATELLITE_RADAR_FALLBACK === "1";
  const result: VegetationRunResult = {
    campaignCode: null,
    examined: 0,
    byStatus: { CONSISTENT: 0, TO_VERIFY: 0, INSUFFICIENT_DATA: 0, PENDING: 0 },
    skipped: 0,
    errors: 0,
    budgetExhausted: false,
    radarDecided: 0,
    interrupted: null,
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

  let consecutiveErrors = 0;
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
    if (metered) {
      const reservation = await reserveProcessingRequest(periodOf(now), "STATISTICS", budget, now);
      if (reservation === "throttled") {
        result.interrupted = "throttled";
        break;
      }
      if (reservation !== "reserved") {
        result.budgetExhausted = true;
        break;
      }
    }
    const to = window.to.getTime() < now.getTime() ? window.to : now;
    const profile = expectedProfile(crop, candidate.zone_code);
    const expectedPeak = { from: window.peakFrom.toISOString(), to: window.peakTo.toISOString() };
    const demoKeys = { commune: candidate.commune_code, parcel: candidate.parcel_id };
    let series;
    try {
      series = await options.provider.vegetationStatistics({
        geometry: geometry.data as PolygonGeometry,
        from: window.from.toISOString(),
        to: to.toISOString(),
        intervalDays: INTERVAL_DAYS,
        expectedCover: profile.kind,
        expectedPeak,
        demoKeys,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, parcel: candidate.parcel_code }, "NDVI de parcelle indisponible");
      result.errors += 1;
      consecutiveErrors += 1;
      // Copernicus injoignable : le lot s'arrête au lieu de réserver des unités dans le vide ; les
      // parcelles restantes passeront au lot suivant.
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        result.interrupted = "provider-unavailable";
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    if (metered && series.processingUnits) {
      await addProcessingUnits(periodOf(now), series.processingUnits);
    }
    let verdict: VegetationVerdict = evaluateVegetation(series.intervals, profile, window, now);
    let decidedBy: "S2" | "S1" = "S2";
    let radarSeries: unknown;

    // Radar Sentinel-1 : seulement quand les nuages ont empêché Sentinel-2 de conclure. Sentinel-2
    // reste la source principale ; le radar a sa propre réservation, dans la même part.
    // Parcelle trop petite pour 10 m : le radar ne conclurait pas davantage, pas de requête.
    if (radarFallback && verdict.status === "INSUFFICIENT_DATA" && !verdict.tooSmall) {
      const reservation = metered
        ? await reserveProcessingRequest(periodOf(now), "STATISTICS", budget, now)
        : "reserved";
      if (reservation === "reserved") {
        try {
          const radar = await options.provider.radarStatistics({
            geometry: geometry.data as PolygonGeometry,
            from: window.from.toISOString(),
            to: to.toISOString(),
            intervalDays: RADAR_INTERVAL_DAYS,
            orbitDirection: RADAR_ORBIT,
            expectedCover: profile.kind,
            expectedPeak,
            demoKeys,
          });
          if (metered && radar.processingUnits) {
            await addProcessingUnits(periodOf(now), radar.processingUnits);
          }
          radarSeries = radar.intervals.map((interval) => ({
            from: interval.from.slice(0, 10),
            to: interval.to.slice(0, 10),
            rvi: interval.rviMean,
            vhDb: interval.vhDbMean,
            valid: interval.validPixels,
          }));
          const radarVerdict = evaluateRadar(
            radar.intervals,
            expectedRadarProfile(crop, candidate.zone_code),
            window,
            now,
          );
          if (radarVerdict.status !== "INSUFFICIENT_DATA") {
            verdict = radarVerdict;
            decidedBy = "S1";
            result.radarDecided += 1;
          }
        } catch (error) {
          if (!(error instanceof RemoteSensingProviderError)) throw error;
          logger.warn(
            { err: error, parcel: candidate.parcel_code },
            "Radar de parcelle indisponible",
          );
        }
      } else if (reservation === "throttled") {
        result.interrupted = "throttled";
      } else {
        result.budgetExhausted = true;
      }
    }
    const provenance =
      decidedBy === "S1" ? options.provider.radarProvenance : options.provider.provenance;
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
      series: series.intervals.map((interval) => ({
        from: interval.from.slice(0, 10),
        to: interval.to.slice(0, 10),
        ndvi: interval.ndviMean,
        valid: interval.validPixels,
      })),
      sensor: decidedBy,
      radarSeries,
      sourceId: provenance.sourceId,
      reliability: provenance.reliability,
    });
    result.examined += 1;
    result.byStatus[verdict.status] += 1;
    if (result.interrupted || result.budgetExhausted) break;
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
