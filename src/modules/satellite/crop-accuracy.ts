import { z } from "zod";
import { prisma } from "@/database/client";
import {
  cropClassCheckCounts,
  listAccuracyCandidates,
  upsertCropClassCheck,
} from "@/database/sql/crop-accuracy.sql";
import type { CropMapClassCode } from "@/database/sql/crop-areas.sql";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { logger } from "@/lib/logger";
import { scopeFilter, type Actor } from "@/modules/authorization";
import {
  RemoteSensingProviderError,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { CROP_CLASS_CODES, CROP_CLASSES } from "@/services/remote-sensing";
import { CULTIVATED_CLASSES, cropMapClassOf, type CultivatedClass } from "./crop-areas";
import { zoneOffset } from "./crop-profiles";
import { processingBudget } from "./imagery";
import { periodOf } from "./periods";

// Précision de la carte des cultures (ADR-0021) : sur les parcelles des exploitations vérifiées,
// la même classification que la carte, en pixels de 10 m sur le contour relevé, face à la culture
// déclarée. La matrice de confusion dit, pour chaque culture, combien de parcelles le satellite
// reconnaît et avec quoi il la confond. Environ 0,16 unité par parcelle (surface minimale
// facturée), dans la part des statistiques.

/** Pixels de 10 m : la résolution native de Sentinel-2, à l'échelle d'un champ. */
const PARCEL_RESOLUTION_M = 10;
/** En dessous, la parcelle est trop petite ou trop couverte pour qu'une classe domine. */
const MIN_CLASSIFIED_PIXELS = 20;
/** Une culture contrôlée sur moins de parcelles n'a pas de taux affiché. */
export const MIN_PARCELS_FOR_RATE = 10;
const WINDOW_DAYS = 365;
const MAX_CONSECUTIVE_ERRORS = 3;
const REQUEST_TIMEOUT_MS = 60_000;
/** Le lot s'arrête avant la limite de 300 s de la route ; le suivant reprend. */
const RUN_BUDGET_MS = 200_000;

const geometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

/** Classe la plus fréquente parmi les pixels classés ; UNCLASSIFIED sous le seuil. */
export function majorityClass(pixels: readonly number[]): {
  observed: CropMapClassCode;
  classified: number;
} {
  let classified = 0;
  let best: CropMapClassCode = "UNCLASSIFIED";
  let bestCount = 0;
  for (const key of CROP_CLASSES) {
    const code = CROP_CLASS_CODES[key];
    if (code === 0) continue;
    const count = pixels[code] ?? 0;
    classified += count;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return { observed: classified >= MIN_CLASSIFIED_PIXELS ? best : "UNCLASSIFIED", classified };
}

export interface CropClassCheckRunResult {
  campaignCode: string | null;
  checked: number;
  unclassified: number;
  errors: number;
  processingUnits: number;
  stopped:
    | "share-exhausted"
    | "units-exhausted"
    | "throttled"
    | "provider-unavailable"
    | "time-budget"
    | null;
}

export async function runCropClassChecks(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
}): Promise<CropClassCheckRunResult> {
  const now = options.now ?? new Date();
  const result: CropClassCheckRunResult = {
    campaignCode: null,
    checked: 0,
    unclassified: 0,
    errors: 0,
    processingUnits: 0,
    stopped: null,
  };
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return result;
  result.campaignCode = campaign.code;

  const candidates = await listAccuracyCandidates({
    campaignId: campaign.id,
    limit: options.limit,
    replaceSynthetic: options.provider.provenance.sourceId !== "BAIS_SEED",
  });
  const budget = processingBudget();
  const metered = options.provider.id === "cdse";
  const windowFrom = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  let consecutiveErrors = 0;
  const started = Date.now();

  for (const candidate of candidates) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      result.stopped = "time-budget";
      break;
    }
    const geometry = geometrySchema.safeParse(JSON.parse(candidate.geometry));
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
    const declaredClass = cropMapClassOf(candidate.crop_code);
    let measure;
    try {
      measure = await options.provider.cropAreaStatistics({
        geometry: geometry.data,
        from: windowFrom.toISOString(),
        to: now.toISOString(),
        resolutionM: PARCEL_RESOLUTION_M,
        latitude: candidate.latitude,
        zoneOffset: zoneOffset(candidate.zone_code),
        expectedClass: CROP_CLASS_CODES[declaredClass],
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, parcel: candidate.parcel_code }, "Classe de parcelle indisponible");
      result.errors += 1;
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        result.stopped = "provider-unavailable";
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    if (metered && measure.processingUnits) {
      await addProcessingUnits(periodOf(now), measure.processingUnits);
    }
    const { observed, classified } = majorityClass(measure.classPixels);
    await upsertCropClassCheck({
      parcelId: candidate.parcel_id,
      campaignId: campaign.id,
      cropId: candidate.crop_id,
      declaredClass,
      observedClass: observed,
      classPixels: measure.classPixels,
      classifiedPixels: classified,
      verificationStatus: candidate.verification_status,
      windowFrom,
      windowTo: now,
      sourceId: options.provider.provenance.sourceId,
      reliability: options.provider.provenance.reliability,
      computedAt: now,
    });
    result.checked += 1;
    if (observed === "UNCLASSIFIED") result.unclassified += 1;
    result.processingUnits += measure.processingUnits ?? 0;
  }
  return result;
}

// --- Matrice de confusion ------------------------------------------------------------------------

export interface ConfusionCount {
  declared: string;
  observed: string;
  count: number;
}

export interface CropClassAccuracy {
  cropClass: CultivatedClass;
  /** Parcelles de cette culture avec une classe observée. */
  parcels: number;
  correct: number;
  /** Part des parcelles de la culture que le satellite reconnaît (exactitude du producteur). */
  recall: number | null;
  /** Part des parcelles vues dans la classe qui la cultivent vraiment (exactitude de l'usager). */
  precision: number | null;
  /** Confusion la plus fréquente, hors la bonne classe. */
  mainConfusion: { observed: CropMapClassCode; share: number } | null;
}

export interface ConfusionMatrix {
  /** Parcelles avec une classe observée : le dénominateur de la précision globale. */
  checked: number;
  /** Parcelles sans classe dominante (nuages, parcelle trop petite), écartées du calcul. */
  unclassified: number;
  overallAccuracy: number | null;
  classes: CropClassAccuracy[];
  /** Lignes : culture déclarée ; colonnes : classe observée, dans l'ordre des codes. */
  rows: { declared: CultivatedClass; counts: Record<CropMapClassCode, number> }[];
  /** Colonnes observées au moins une fois, sans la classe « non classé ». */
  observedColumns: CropMapClassCode[];
}

const emptyCounts = () =>
  Object.fromEntries(CROP_CLASSES.map((key) => [key, 0])) as Record<CropMapClassCode, number>;

/** Matrice de confusion et taux par culture, à partir des comptes (fonction pure). */
export function confusionMatrix(counts: readonly ConfusionCount[]): ConfusionMatrix {
  const rows = new Map<CultivatedClass, Record<CropMapClassCode, number>>(
    CULTIVATED_CLASSES.map((key) => [key, emptyCounts()]),
  );
  let unclassified = 0;
  for (const entry of counts) {
    const row = rows.get(entry.declared as CultivatedClass);
    if (!row || !(entry.observed in row)) continue;
    if (entry.observed === "UNCLASSIFIED") {
      unclassified += entry.count;
      continue;
    }
    row[entry.observed as CropMapClassCode] += entry.count;
  }
  let checked = 0;
  let correct = 0;
  const columnTotals = emptyCounts();
  for (const [declared, row] of rows) {
    for (const key of CROP_CLASSES) {
      checked += row[key];
      columnTotals[key] += row[key];
    }
    correct += row[declared];
  }
  const rate = (part: number, whole: number) =>
    whole >= MIN_PARCELS_FOR_RATE ? part / whole : null;
  const classes = [...rows.entries()].map(([declared, row]) => {
    const parcels = CROP_CLASSES.reduce((sum, key) => sum + row[key], 0);
    let mainConfusion: CropClassAccuracy["mainConfusion"] = null;
    for (const key of CROP_CLASSES) {
      if (key === declared || key === "UNCLASSIFIED" || row[key] === 0) continue;
      if (!mainConfusion || row[key] > mainConfusion.share * parcels) {
        mainConfusion = { observed: key, share: parcels > 0 ? row[key] / parcels : 0 };
      }
    }
    return {
      cropClass: declared,
      parcels,
      correct: row[declared],
      recall: rate(row[declared], parcels),
      precision: rate(row[declared], columnTotals[declared]),
      mainConfusion,
    };
  });
  return {
    checked,
    unclassified,
    overallAccuracy: checked >= MIN_PARCELS_FOR_RATE ? correct / checked : null,
    classes,
    rows: [...rows.entries()].map(([declared, row]) => ({ declared, counts: row })),
    observedColumns: CROP_CLASSES.filter((key) => key !== "UNCLASSIFIED" && columnTotals[key] > 0),
  };
}

export interface CropMapAccuracy extends ConfusionMatrix {
  campaignCode: string;
  /** Parcelles contrôlées issues d'une visite de terrain (le reste : vérifiées au bureau). */
  fieldVerified: number;
  sources: { sourceId: string; lastComputedAt: Date }[];
}

/** Précision de la carte des cultures pour le ministère (portée nationale sur le registre). */
export async function getCropMapAccuracy(actor: Actor): Promise<CropMapAccuracy | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;
  const rows = await cropClassCheckCounts(campaign.id);
  const merged = new Map<string, ConfusionCount>();
  const sources = new Map<string, Date>();
  let fieldVerified = 0;
  for (const row of rows) {
    const key = `${row.declared_class}:${row.observed_class}`;
    const entry = merged.get(key) ?? {
      declared: row.declared_class,
      observed: row.observed_class,
      count: 0,
    };
    entry.count += row.count;
    merged.set(key, entry);
    if (row.verification_status === "FIELD_VERIFIED" && row.observed_class !== "UNCLASSIFIED") {
      fieldVerified += row.count;
    }
    const last = sources.get(row.source_id);
    if (!last || row.last_computed_at > last) sources.set(row.source_id, row.last_computed_at);
  }
  return {
    campaignCode: campaign.code,
    fieldVerified,
    sources: [...sources.entries()].map(([sourceId, lastComputedAt]) => ({
      sourceId,
      lastComputedAt,
    })),
    ...confusionMatrix([...merged.values()]),
  };
}
