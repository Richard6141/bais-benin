import { z } from "zod";
import { prisma } from "@/database/client";
import {
  burnCandidates,
  burnUnitsSince,
  expireBurnAssessments,
  queueExposedParcels,
} from "@/database/sql/burned-area.sql";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processingBudget } from "@/modules/satellite/imagery";
import { periodOf } from "@/modules/satellite/periods";
import {
  createFixtureRemoteSensingProvider,
  getRemoteSensingProvider,
} from "@/services/remote-sensing";
import {
  RemoteSensingProviderError,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import {
  EXPIRE_DAYS,
  EXPOSURE_M,
  MEASURE_AFTER_DAYS,
  MIN_PARCEL_HA,
  burnFigures,
  burnWindows,
} from "./burned-area-rules";

// Surface brûlée des parcelles exposées (ADR-0038 §2). Mise en file sur alerte de feu ou à la
// demande d'un agent ou du ministère, jamais en passe systématique ; mesure par la tâche du jour,
// 15 à 30 jours après le feu, sous le plafond mensuel FIRE_BURN_MONTHLY_UNIT_CAP. Avec
// FIRE_BURN_READS=1, Copernicus sur les parcelles réelles (un contour relevé sur place rend réelle
// une parcelle de démonstration) ; sinon la
// fixture, sur toutes les parcelles, marquée comme synthétique. Une surface brûlée assez grande
// propose une déclaration de sinistre, que l'agent confirme ou écarte sur place.

const DAY_MS = 86_400_000;
/** Fenêtre des détections d'une alerte de feu (ADR-0022). */
const ALERT_WINDOW_MS = DAY_MS;
const REQUEST_TIMEOUT_MS = 90_000;
const RUN_BUDGET_MS = 240_000;
const MAX_CONSECUTIVE_ERRORS = 3;

/** Lectures réelles : parcelles de démonstration écartées de la file. */
function realReads(): boolean {
  return getServerEnv().FIRE_BURN_READS === "1";
}

/** Fournisseur de la tâche : Copernicus si FIRE_BURN_READS=1, sinon la fixture. */
export function burnProvider(): RemoteSensingProvider {
  return realReads() ? getRemoteSensingProvider() : createFixtureRemoteSensingProvider();
}

function queueOptions(now: Date, since: Date) {
  return {
    since,
    exposureM: EXPOSURE_M,
    minAreaM2: MIN_PARCEL_HA * 10_000,
    measureAfterDays: MEASURE_AFTER_DAYS,
    expireDays: EXPIRE_DAYS,
    realOnly: realReads(),
  };
}

/** Parcelles exposées aux feux d'une alerte levée : dans sa commune, feux des 24 heures. */
export async function queueBurnAssessmentsForAlert(
  alertId: string,
  now: Date = new Date(),
): Promise<number> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { communeId: true, category: true },
  });
  if (!alert || alert.category !== "FIRE") return 0;
  const ids = await queueExposedParcels({
    ...queueOptions(now, new Date(now.getTime() - ALERT_WINDOW_MS)),
    trigger: "ALERT",
    alertId,
    communeId: alert.communeId,
  });
  return ids.length;
}

/**
 * Après un passage d'ingestion : parcelles exposées aux feux de chaque alerte de feu active (une
 * alerte levée, ou prolongée par un feu plus tardif). Idempotent : une parcelle déjà en file pour
 * un feu ne l'est pas deux fois.
 */
export async function queueBurnAssessmentsForActiveFireAlerts(
  now: Date = new Date(),
): Promise<number> {
  const alerts = await prisma.alert.findMany({
    where: { status: "ACTIVE", category: "FIRE" },
    select: { id: true },
  });
  let queued = 0;
  for (const alert of alerts) queued += await queueBurnAssessmentsForAlert(alert.id, now);
  return queued;
}

/** Parcelles d'une exploitation exposées à un feu des 30 derniers jours, à la demande. */
export async function queueBurnAssessmentsForFarm(
  farmId: string,
  requestedById: string,
  now: Date = new Date(),
): Promise<number> {
  const ids = await queueExposedParcels({
    ...queueOptions(now, new Date(now.getTime() - EXPIRE_DAYS * DAY_MS)),
    trigger: "REQUEST",
    requestedById,
    farmId,
  });
  return ids.length;
}

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()).min(2))).min(1),
});

export interface BurnRunResult {
  measured: number;
  insufficient: number;
  proposed: number;
  expired: number;
  errors: number;
  processingUnits: number;
  /** Unités dépensées ce mois-ci par cette tâche, cet appel compris. */
  monthUnits: number;
  stopped:
    | "share-exhausted"
    | "units-exhausted"
    | "throttled"
    | "provider-unavailable"
    | "time-budget"
    | "monthly-cap"
    | null;
}

/**
 * Mesure les parcelles en attente dont la fenêtre d'après le feu est close (tâche du jour) : une
 * requête Statistical par parcelle, environ 0,1 unité, dans la part des statistiques.
 */
export async function measureBurnAssessments(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
  monthlyUnitCap?: number;
}): Promise<BurnRunResult> {
  const now = options.now ?? new Date();
  const result: BurnRunResult = {
    measured: 0,
    insufficient: 0,
    proposed: 0,
    expired: await expireBurnAssessments(now),
    errors: 0,
    processingUnits: 0,
    monthUnits: 0,
    stopped: null,
  };
  const metered = options.provider.id === "cdse";
  const cap = options.monthlyUnitCap ?? getServerEnv().FIRE_BURN_MONTHLY_UNIT_CAP;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  result.monthUnits = metered ? await burnUnitsSince(monthStart) : 0;
  const budget = processingBudget();
  const started = Date.now();
  let consecutiveErrors = 0;

  for (const candidate of await burnCandidates(now, options.limit)) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      result.stopped = "time-budget";
      break;
    }
    if (metered && result.monthUnits >= cap) {
      result.stopped = "monthly-cap";
      break;
    }
    const geometry = polygonSchema.safeParse(JSON.parse(candidate.geometry));
    if (!geometry.success) {
      result.errors += 1;
      continue;
    }
    if (metered) {
      const reservation = await reserveProcessingRequest(periodOf(now), "STATISTICS", budget, now);
      if (reservation !== "reserved") {
        result.stopped = reservation;
        break;
      }
    }
    const windows = burnWindows(candidate.fire_detected_at);
    let read;
    try {
      read = await options.provider.burnSeverity({
        geometry: geometry.data,
        fireAt: candidate.fire_detected_at.toISOString(),
        preFrom: windows.preFrom.toISOString(),
        postTo: new Date(Math.min(windows.postTo.getTime(), now.getTime())).toISOString(),
        latitude: candidate.latitude,
        timeoutMs: REQUEST_TIMEOUT_MS,
        demoKey: candidate.parcel_id,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, parcel: candidate.parcel_code }, "Surface brûlée indisponible");
      result.errors += 1;
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        result.stopped = "provider-unavailable";
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    const units = read.processingUnits ?? 0;
    if (metered && units > 0) await addProcessingUnits(periodOf(now), units);
    const figures = burnFigures(read.classPixels, candidate.area_ha);
    await prisma.$transaction(async (tx) => {
      await tx.burnAssessment.update({
        where: { id: candidate.id },
        data: {
          status: figures.sufficient ? "MEASURED" : "INSUFFICIENT_IMAGE",
          validShare: figures.validShare,
          burnedShareLow: figures.sufficient ? figures.lowShare : null,
          burnedShareHigh: figures.sufficient ? figures.highShare : null,
          severeShare: figures.sufficient ? figures.severeShare : null,
          burnedAreaLowHa: figures.sufficient ? figures.lowHa : null,
          burnedAreaHighHa: figures.sufficient ? figures.highHa : null,
          pixels: figures.pixels,
          processingUnits: metered ? units : null,
          sourceId: options.provider.provenance.sourceId,
          reliability: options.provider.provenance.reliability,
          measuredAt: now,
        },
      });
      if (figures.proposesDeclaration) {
        await tx.damageDeclaration.create({
          data: {
            farmId: candidate.farm_id,
            parcelId: candidate.parcel_id,
            burnAssessmentId: candidate.id,
            occurredAt: candidate.fire_detected_at,
            estimatedLowHa: figures.lowHa,
            estimatedHighHa: figures.highHa,
          },
        });
      }
    });
    if (figures.sufficient) result.measured += 1;
    else result.insufficient += 1;
    if (figures.proposesDeclaration) result.proposed += 1;
    result.processingUnits += units;
    result.monthUnits += metered ? units : 0;
  }
  return result;
}
