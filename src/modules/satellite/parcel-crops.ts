import { z } from "zod";
import { prisma } from "@/database/client";
import {
  listSignatureCandidates,
  nextModelVersion,
  seriesUnitsSince,
  predictionForParcel,
  signaturesForCampaign,
  upsertPredictions,
  upsertSignature,
  type PredictionRow,
} from "@/database/sql/parcel-crops.sql";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  DEFAULT_FOREST,
  predictClass,
  trainRandomForest,
  type RandomForestParams,
} from "@/lib/ml/random-forest";
import type { Prisma } from "@/generated/prisma/client";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";
import {
  RemoteSensingProviderError,
  type ParcelSeriesResult,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { cropGroupLabel, cropGroupOf, singleCropOf, type CropGroup } from "./crop-groups";
import {
  UNCERTAIN_BELOW,
  cropDoubtReason,
  trainingLabel,
  visitPriority,
} from "./parcel-crop-rules";
import { processingBudget } from "./imagery";
import {
  FEATURE_NAMES,
  FEATURE_VERSION,
  featureVector,
  mergeSeries,
  parcelFeatures,
  signatureWindowStart,
} from "./parcel-features";
import { periodOf } from "./periods";

// Cultures par parcelle (ADR-0030), démarche des organismes payeurs de la PAC et de Sen4CAP :
// 1. les séries Sentinel-2 et Sentinel-1 de chaque parcelle des communes pilotes, lues sur son
//    contour et complétées chaque mois (seul le nouveau morceau est demandé à Copernicus) ;
// 2. une forêt aléatoire entraînée sur les parcelles des exploitations vérifiées par les agents ;
// 3. pour chaque parcelle lue : la culture mesurée, sa confiance, l'écart avec la déclaration.

const DAY_MS = 86_400_000;
/** Une série lue il y a moins de dix jours n'a pas de nouvelle décade à ajouter. */
const REFRESH_AFTER_MS = 10 * DAY_MS;
const REQUEST_TIMEOUT_MS = 60_000;
const RUN_BUDGET_MS = 200_000;
const MAX_CONSECUTIVE_ERRORS = 3;
/** Une classe vue sur moins de parcelles vérifiées n'est pas apprise. */
export const MIN_CLASS_SAMPLES = 8;

const geometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const s2Schema = z.array(
  z.object({
    from: z.string(),
    to: z.string(),
    ndvi: z.number().nullable(),
    ndmi: z.number().nullable(),
    valid: z.number(),
  }),
);
const s1Schema = z.array(
  z.object({
    from: z.string(),
    to: z.string(),
    vv: z.number().nullable(),
    vh: z.number().nullable(),
  }),
);

async function openCampaign() {
  return prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true, startsOn: true, endsOn: true },
  });
}

export interface SeriesRunResult {
  campaignCode: string | null;
  read: number;
  errors: number;
  processingUnits: number;
  stopped:
    | "share-exhausted"
    | "units-exhausted"
    | "throttled"
    | "provider-unavailable"
    | "time-budget"
    | "monthly-cap"
    | null;
  /** Unités dépensées ce mois-ci par cette tâche, cet appel compris. */
  monthUnits: number;
}

/**
 * Lit ou complète les séries des parcelles des communes pilotes (tâche planifiée). Deux requêtes
 * Statistical par parcelle (Sentinel-2 et Sentinel-1), dans la part des statistiques.
 */
export async function collectParcelSeries(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
  communeCodes?: readonly string[];
  /** Plafond mensuel en unités ; par défaut CROP_MODEL_MONTHLY_UNIT_CAP. */
  monthlyUnitCap?: number;
}): Promise<SeriesRunResult> {
  const now = options.now ?? new Date();
  const result: SeriesRunResult = {
    campaignCode: null,
    read: 0,
    errors: 0,
    processingUnits: 0,
    stopped: null,
    monthUnits: 0,
  };
  const campaign = await openCampaign();
  if (!campaign) return result;
  result.campaignCode = campaign.code;
  const windowFrom = signatureWindowStart(campaign.startsOn);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cap = options.monthlyUnitCap ?? getServerEnv().CROP_MODEL_MONTHLY_UNIT_CAP;
  const until = new Date(Math.min(now.getTime(), campaign.endsOn.getTime() + DAY_MS));
  const candidates = await listSignatureCandidates({
    campaignId: campaign.id,
    communeCodes: options.communeCodes ?? getServerEnv().CROP_MODEL_PILOT_COMMUNES,
    staleBefore: new Date(until.getTime() - REFRESH_AFTER_MS),
    replaceSynthetic: options.provider.provenance.sourceId !== "BAIS_SEED",
    limit: options.limit,
  });
  const metered = options.provider.id === "cdse";
  const budget = processingBudget();
  const started = Date.now();
  let consecutiveErrors = 0;
  result.monthUnits = metered ? await seriesUnitsSince(monthStart) : 0;

  for (const candidate of candidates) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      result.stopped = "time-budget";
      break;
    }
    // Plafond mensuel de la tâche, tenu avant chaque parcelle : une première lecture coûte près
    // d'une unité, un complément mensuel environ un dixième.
    if (metered && result.monthUnits >= cap) {
      result.stopped = "monthly-cap";
      break;
    }
    const geometry = geometrySchema.safeParse(JSON.parse(candidate.geometry));
    if (!geometry.success) {
      result.errors += 1;
      continue;
    }
    const knownS2 = s2Schema.safeParse(candidate.s2_series);
    const knownS1 = s1Schema.safeParse(candidate.s1_series);
    // Complément seulement sur une série de la même source : une mesure réelle refait en entier
    // une série de démonstration.
    const incremental =
      candidate.observed_until !== null &&
      candidate.source_id === options.provider.provenance.sourceId &&
      knownS2.success &&
      knownS1.success;
    // Le nouveau morceau reprend à la dernière décade connue, qui était peut-être incomplète.
    const from = incremental
      ? new Date(
          windowFrom.getTime() +
            Math.max(
              0,
              Math.floor(
                (candidate.observed_until!.getTime() - windowFrom.getTime()) / (10 * DAY_MS),
              ),
            ) *
              10 *
              DAY_MS,
        )
      : windowFrom;
    if (metered) {
      let refused: SeriesRunResult["stopped"] = null;
      for (let request = 0; request < 2 && !refused; request += 1) {
        const reservation = await reserveProcessingRequest(
          periodOf(now),
          "STATISTICS",
          budget,
          now,
        );
        if (reservation !== "reserved") refused = reservation;
      }
      if (refused) {
        result.stopped = refused;
        break;
      }
    }
    let series: ParcelSeriesResult;
    try {
      series = await options.provider.parcelSeries({
        geometry: geometry.data,
        from: from.toISOString(),
        to: until.toISOString(),
        latitude: candidate.latitude,
        timeoutMs: REQUEST_TIMEOUT_MS,
        expectedGroup: candidate.crop_code
          ? (cropGroupOf(candidate.crop_code) ?? undefined)
          : undefined,
        demoKeys: { commune: candidate.commune_code, parcel: candidate.parcel_id },
        verified: candidate.verified,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn(
        { err: error, parcel: candidate.parcel_code },
        "Séries de parcelle indisponibles",
      );
      result.errors += 1;
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        result.stopped = "provider-unavailable";
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    if (metered && series.processingUnits) {
      await addProcessingUnits(periodOf(now), series.processingUnits);
    }
    const s2 = incremental ? mergeSeries(knownS2.data!, series.s2, from) : series.s2;
    const s1 = incremental ? mergeSeries(knownS1.data!, series.s1, from) : series.s1;
    const units =
      (incremental ? (candidate.processing_units ?? 0) : 0) + (series.processingUnits ?? 0);
    await upsertSignature({
      parcelId: candidate.parcel_id,
      campaignId: campaign.id,
      windowFrom,
      observedUntil: until,
      s2Series: s2,
      s1Series: s1,
      features: parcelFeatures({ windowFrom, observedUntil: until, s2, s1 }),
      featureVersion: FEATURE_VERSION,
      processingUnits: metered ? units : null,
      lastProcessingUnits: metered ? (series.processingUnits ?? null) : null,
      sourceId: options.provider.provenance.sourceId,
      reliability: options.provider.provenance.reliability,
      computedAt: now,
    });
    result.read += 1;
    result.processingUnits += series.processingUnits ?? 0;
    result.monthUnits += series.processingUnits ?? 0;
  }
  return result;
}

export interface ModelRunResult {
  campaignCode: string | null;
  version: number | null;
  trainingParcels: number;
  classes: string[];
  outOfBagAccuracy: number | null;
  predicted: number;
  byAgreement: Record<"AGREES" | "DIFFERS" | "UNCERTAIN", number>;
  /** Classes écartées faute de parcelles vérifiées. */
  skippedClasses: Record<string, number>;
  /** Étiquettes venues d'une visite de terrain (le reste : vérification au bureau). */
  fieldVisitLabels: number;
  /** Vrai si rien n'a changé depuis le dernier modèle : pas de nouvelle version. */
  unchanged: boolean;
}

/**
 * Entraîne une nouvelle version du modèle sur les parcelles vérifiées, puis mesure la culture de
 * toutes les parcelles lues (tâche planifiée, sans appel à Copernicus).
 */
export async function trainAndPredictCrops(
  options: { now?: Date; params?: RandomForestParams; force?: boolean } = {},
): Promise<ModelRunResult> {
  const now = options.now ?? new Date();
  const result: ModelRunResult = {
    campaignCode: null,
    version: null,
    trainingParcels: 0,
    classes: [],
    outOfBagAccuracy: null,
    predicted: 0,
    byAgreement: { AGREES: 0, DIFFERS: 0, UNCERTAIN: 0 },
    skippedClasses: {},
    fieldVisitLabels: 0,
    unchanged: false,
  };
  const campaign = await openCampaign();
  if (!campaign) return result;
  result.campaignCode = campaign.code;
  const signatures = await signaturesForCampaign(campaign.id, FEATURE_VERSION);
  const labelled = signatures.flatMap((signature) => {
    const label = trainingLabel(signature);
    return label ? [{ signature, ...label }] : [];
  });
  const counts = new Map<CropGroup, number>();
  for (const entry of labelled) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
  const training = labelled.filter((entry) => (counts.get(entry.group) ?? 0) >= MIN_CLASS_SAMPLES);
  for (const [group, count] of counts) {
    if (count < MIN_CLASS_SAMPLES) result.skippedClasses[group] = count;
  }
  if (new Set(training.map((entry) => entry.group)).size < 2) return result;
  result.fieldVisitLabels = training.filter((entry) => entry.weight > 1).length;

  // Empreinte des données : sans nouvelle visite, étiquette ni série, pas de nouvelle version.
  const latest = (value: Date | null, next: Date | null) =>
    next && (!value || next > value) ? next : value;
  const fingerprint = [
    FEATURE_VERSION,
    training.length,
    result.fieldVisitLabels,
    training
      .reduce<Date | null>(
        (max, entry) =>
          latest(latest(max, entry.signature.visited_at), entry.signature.observed_at),
        null,
      )
      ?.toISOString(),
    signatures
      .reduce<Date | null>((max, entry) => latest(max, entry.computed_at), null)
      ?.toISOString(),
  ].join(":");
  const previous = await prisma.cropModel.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: "desc" },
    select: { version: true, metrics: true, classes: true, trainingParcels: true },
  });
  const previousMetrics = previous?.metrics as
    { fingerprint?: string; outOfBagAccuracy?: number | null } | undefined;
  if (previous && previousMetrics?.fingerprint === fingerprint && !options.force) {
    // Rien de nouveau : le modèle en place reste, ses chiffres sont rendus tels quels.
    Object.assign(result, {
      version: previous.version,
      trainingParcels: previous.trainingParcels,
      classes: previous.classes,
      outOfBagAccuracy: previousMetrics.outOfBagAccuracy ?? null,
      unchanged: true,
    });
    return result;
  }

  const params = options.params ?? DEFAULT_FOREST;
  const { model, outOfBagAccuracy } = trainRandomForest(
    training.map((entry) => featureVector(entry.signature.features)),
    training.map((entry) => entry.group),
    FEATURE_NAMES,
    params,
    training.map((entry) => entry.weight),
  );
  const synthetic = signatures.some((signature) => signature.source_id === "BAIS_SEED");
  const version = await nextModelVersion();
  const stored = await prisma.cropModel.create({
    data: {
      version,
      campaignId: campaign.id,
      algorithm: "random-forest",
      featureVersion: FEATURE_VERSION,
      classes: model.classes,
      featureNames: model.features,
      params: { ...params },
      model: model as object,
      trainingParcels: training.length,
      metrics: {
        outOfBagAccuracy,
        classCounts: Object.fromEntries(counts),
        fieldVisitLabels: result.fieldVisitLabels,
        fingerprint,
      },
      sourceId: synthetic ? "BAIS_SEED" : "COPERNICUS_S2",
      reliability: synthetic ? "SYNTHETIC" : "ESTIMATED",
      trainedAt: now,
    },
    select: { id: true },
  });

  const rows: PredictionRow[] = signatures.map((signature) => {
    const prediction = predictClass(model, featureVector(signature.features));
    const declared = signature.crop_code ? cropGroupOf(signature.crop_code) : null;
    const agreement =
      prediction.confidence < UNCERTAIN_BELOW
        ? "UNCERTAIN"
        : prediction.label === declared
          ? "AGREES"
          : "DIFFERS";
    result.byAgreement[agreement] += 1;
    return {
      parcelId: signature.parcel_id,
      campaignId: campaign.id,
      modelId: stored.id,
      cropGroup: prediction.label,
      cropCode: singleCropOf(prediction.label as CropGroup),
      confidence: Number(prediction.confidence.toFixed(3)),
      probabilities: prediction.probabilities,
      declaredGroup: declared,
      agreement,
      observedUntil: signature.observed_until,
      sourceId: signature.source_id,
      reliability: signature.source_id === "BAIS_SEED" ? "SYNTHETIC" : "ESTIMATED",
      computedAt: now,
    };
  });
  await upsertPredictions(rows);
  Object.assign(result, {
    version,
    trainingParcels: training.length,
    classes: model.classes,
    outOfBagAccuracy,
    predicted: rows.length,
  });
  return result;
}

export interface ParcelCropPrediction {
  cropGroup: string;
  cropLabel: string;
  cropId: string | null;
  /** Probabilité de la culture mesurée, de 0 à 1. */
  confidence: number;
  agreement: "AGREES" | "DIFFERS" | "UNCERTAIN";
  declaredLabel: string | null;
  observedUntil: Date;
  modelVersion: number;
  /**
   * Dernière visite de terrain de la parcelle, s'il y en a une. Avec une culture constatée :
   * CONFIRMED si elle rejoint la culture mesurée, CORRECTED sinon, et son libellé.
   */
  confirmation: {
    visitedAt: Date;
    outcome: "CONFIRMED" | "CORRECTED" | "REJECTED";
    observedLabel: string | null;
  } | null;
}

/**
 * Culture mesurée d'une parcelle pour la campagne ouverte, avec les droits de la fiche : l'agent
 * pour les exploitations qu'il suit, le ministère pour tout. Null sans mesure ou sans droit.
 */
export async function getParcelCropPrediction(
  actor: Actor,
  parcelId: string,
): Promise<ParcelCropPrediction | null> {
  const parcel = await prisma.parcel.findFirst({
    where: { id: parcelId, archivedAt: null },
    select: {
      farm: {
        select: { communeId: true, registeredById: true, farmer: { select: { userId: true } } },
      },
    },
  });
  if (!parcel) return null;
  const decision = authorize(actor, "farm.read", {
    ownerUserId: parcel.farm.farmer.userId,
    registeredByUserId: parcel.farm.registeredById,
    communeId: parcel.farm.communeId,
  });
  if (!decision.allowed) return null;
  const row = await predictionForParcel(parcelId);
  if (!row) return null;
  return {
    cropGroup: row.crop_group,
    cropLabel: cropGroupLabel(row.crop_group),
    cropId: row.crop_id,
    confidence: row.confidence,
    agreement: row.agreement,
    declaredLabel: row.declared_group ? cropGroupLabel(row.declared_group) : null,
    observedUntil: row.observed_until,
    modelVersion: row.model_version,
    confirmation: confirmationOf(row),
  };
}

function confirmationOf(row: {
  crop_group: string;
  visited_at: Date | null;
  outcome: "CONFIRMED" | "CORRECTED" | "REJECTED" | null;
  observed_crop_code: string | null;
  observed_at: Date | null;
}): ParcelCropPrediction["confirmation"] {
  const observedGroup = row.observed_crop_code ? cropGroupOf(row.observed_crop_code) : null;
  if (row.observed_at && observedGroup) {
    return {
      visitedAt: row.observed_at,
      outcome: observedGroup === row.crop_group ? "CONFIRMED" : "CORRECTED",
      observedLabel: cropGroupLabel(observedGroup),
    };
  }
  return row.visited_at && row.outcome
    ? { visitedAt: row.visited_at, outcome: row.outcome, observedLabel: null }
    : null;
}

export interface CropVisitPriority {
  parcelId: string;
  parcelCode: string;
  farmId: string;
  farmerName: string;
  communeName: string;
  village: string | null;
  agreement: "DIFFERS" | "UNCERTAIN";
  confidence: number;
  reason: string;
}

/** Exploitations lisibles par l'acteur, au format des requêtes Prisma. */
function farmScope(actor: Actor): Prisma.FarmWhereInput | null {
  const scope = scopeFilter(actor, "farm.read");
  switch (scope.kind) {
    case "all":
      return {};
    case "registered":
      return { registeredById: scope.userId };
    case "self":
      return { farmer: { userId: scope.userId } };
    case "territory":
      return {
        OR: [
          { communeId: { in: scope.communeIds } },
          { commune: { departementId: { in: scope.departementIds } } },
        ],
      };
    default:
      return null;
  }
}

/**
 * Parcelles à visiter en priorité pour la culture (apprentissage actif) : celles que le satellite
 * voit autrement que déclarées, puis les incertaines, sans culture déjà constatée cette campagne.
 * Dans le périmètre de l'agent seulement.
 */
export async function listCropVisitPriorities(
  actor: Actor,
  limit = 20,
): Promise<CropVisitPriority[]> {
  const scope = farmScope(actor);
  if (!scope) return [];
  const rows = await prisma.parcelCropPrediction.findMany({
    where: {
      campaign: { status: "OPEN" },
      agreement: { in: ["DIFFERS", "UNCERTAIN"] },
      parcel: {
        archivedAt: null,
        farm: { AND: [scope, { archivedAt: null }] },
        cropObservations: { none: { campaign: { status: "OPEN" } } },
      },
    },
    select: {
      parcelId: true,
      cropGroup: true,
      declaredGroup: true,
      confidence: true,
      agreement: true,
      parcel: {
        select: {
          code: true,
          farm: {
            select: {
              id: true,
              village: true,
              commune: { select: { name: true } },
              farmer: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
    take: 500,
  });
  return rows
    .flatMap((row) => {
      const agreement = row.agreement as "DIFFERS" | "UNCERTAIN";
      const confidence = Number(row.confidence);
      const priority = visitPriority(agreement, confidence);
      if (priority === null) return [];
      const farm = row.parcel.farm;
      return [
        {
          priority,
          parcelId: row.parcelId,
          parcelCode: row.parcel.code,
          farmId: farm.id,
          farmerName: `${farm.farmer.firstName} ${farm.farmer.lastName}`,
          communeName: farm.commune.name,
          village: farm.village,
          agreement,
          confidence,
          reason: cropDoubtReason({
            agreement,
            measuredLabel: cropGroupLabel(row.cropGroup),
            declaredLabel: row.declaredGroup ? cropGroupLabel(row.declaredGroup) : null,
            confidence,
          }),
        },
      ];
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((entry) => {
      const { priority, ...rest } = entry;
      void priority;
      return rest;
    });
}
