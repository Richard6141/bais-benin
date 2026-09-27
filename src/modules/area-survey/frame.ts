import { prisma } from "@/database/client";
import {
  communesForFrame,
  gridPointsInCommune,
  insertFramePoints,
  pointsToClassify,
  pointsToStratify,
  setPointMapClass,
  setPointStrata,
} from "@/database/sql/area-survey.sql";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { seededRandom } from "@/lib/ml/random-forest";
import { neymanAllocation, systematicPositions } from "@/lib/stats/stratified-estimator";
import { CROP_AREA_METHOD_VERSION, CROP_AREA_RESOLUTION_M } from "@/modules/satellite/crop-areas";
import { cropMapClassOf } from "@/modules/satellite/crop-areas";
import { zoneOffset } from "@/modules/satellite/crop-profiles";
import { processingBudget } from "@/modules/satellite/imagery";
import { periodOf } from "@/modules/satellite/periods";
import {
  RemoteSensingProviderError,
  type PolygonGeometry,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { CROP_CLASS_CODES, CROP_CLASSES } from "@/services/remote-sensing";
import {
  ANTICIPATED_STAPLE_SHARE,
  FIRST_PHASE_FACTOR,
  FRAME_STRATA,
  MIN_POINTS_PER_STRATUM,
  stratumOf,
  type FrameStratum,
} from "./strata";

// Base de sondage aréolaire (ADR-0033, ADR-0037) : tirage en deux phases des points d'une commune
// d'enquête, une fois par campagne. Première phase, une grille dense ; la classe de la carte des
// pixels est lue à chaque point, par la même méthode que les surfaces par commune. Seconde phase,
// les points à visiter, tirés dans chaque strate de la carte (allocation de Neyman avec plancher).

/** Points à visiter par commune pilote, 600 au total. */
export const POINTS_PER_COMMUNE = 120;
/** Distance au point au-delà de laquelle un constat est refusé (sauf point inaccessible). */
export const MAX_POINT_DISTANCE_M = 50;
/** Écart minimal de la grille : une petite commune n'a pas des points à touche-touche. */
const MIN_SPACING_M = 500;
const WINDOW_DAYS = 365;
const REQUEST_TIMEOUT_MS = 60_000;
const RUN_BUDGET_MS = 200_000;
const MAX_CONSECUTIVE_ERRORS = 3;

/** Écart de la grille qui donne environ `points` points sur `areaM2`. */
export function gridSpacing(areaM2: number, points: number): number {
  return Math.max(MIN_SPACING_M, Math.round(Math.sqrt(areaM2 / points)));
}

/** Empreinte FNV-1a d'un texte, graine reproductible du tirage. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Origine de la grille, tirée d'une graine propre à la campagne et à la commune. */
export function gridOrigin(
  campaignCode: string,
  communeCode: string,
  spacingM: number,
): { originXM: number; originYM: number } {
  const random = seededRandom(hashText(`${campaignCode}:${communeCode}`));
  return {
    originXM: Math.floor(random() * spacingM),
    originYM: Math.floor(random() * spacingM),
  };
}

/** Code lisible d'un point : code de la commune et rang sur trois chiffres. */
export function pointCode(communeCode: string, rank: number): string {
  return `${communeCode}-${String(rank).padStart(3, "0")}`;
}

/** Carré d'un pixel de la carte (120 m) centré sur le point. */
export function pointSquare(latitude: number, longitude: number): PolygonGeometry {
  const half = CROP_AREA_RESOLUTION_M / 2;
  const dLat = half / 111_320;
  const dLon = half / (111_320 * Math.cos((latitude * Math.PI) / 180));
  return {
    type: "Polygon",
    coordinates: [
      [
        [longitude - dLon, latitude - dLat],
        [longitude + dLon, latitude - dLat],
        [longitude + dLon, latitude + dLat],
        [longitude - dLon, latitude + dLat],
        [longitude - dLon, latitude - dLat],
      ],
    ],
  };
}

/** Classe la plus fréquente parmi les pixels lus, non classé compris (comme dans la commune). */
export function pointMapClass(classPixels: readonly number[]): string {
  let best = "UNCLASSIFIED";
  let bestCount = 0;
  for (const key of CROP_CLASSES) {
    const count = classPixels[CROP_CLASS_CODES[key]] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

async function openCampaign() {
  return prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
}

export interface FrameDrawResult {
  campaignCode: string | null;
  /** Points de première phase tirés dans chaque commune. */
  communes: { code: string; drawn: number; spacingM: number }[];
}

/**
 * Tire la première phase des communes d'enquête qui n'ont pas encore de points pour la campagne
 * ouverte : une grille `FIRST_PHASE_FACTOR` fois plus dense que les points à visiter. Ces points
 * attendent la classe de la carte ; les agents ne les voient pas. Une commune déjà tirée n'est
 * jamais retirée : le tirage vaut pour toute la campagne.
 */
export async function drawAreaFrame(
  options: { communeCodes?: readonly string[]; pointsPerCommune?: number; now?: Date } = {},
): Promise<FrameDrawResult> {
  const now = options.now ?? new Date();
  const campaign = await openCampaign();
  if (!campaign) return { campaignCode: null, communes: [] };
  const firstPhase = (options.pointsPerCommune ?? POINTS_PER_COMMUNE) * FIRST_PHASE_FACTOR;
  const communes = await communesForFrame(
    campaign.id,
    options.communeCodes ?? getServerEnv().CROP_MODEL_PILOT_COMMUNES,
  );
  const result: FrameDrawResult = { campaignCode: campaign.code, communes: [] };
  for (const commune of communes) {
    if (commune.points > 0) continue;
    const spacingM = gridSpacing(commune.area_m2, firstPhase);
    const grid = { spacingM, ...gridOrigin(campaign.code, commune.code, spacingM) };
    const nodes = await gridPointsInCommune(commune.id, grid);
    const points = nodes.map((node, index) => ({
      id: crypto.randomUUID(),
      code: pointCode(commune.code, index + 1),
      latitude: Number(node.latitude.toFixed(6)),
      longitude: Number(node.longitude.toFixed(6)),
    }));
    const drawn = await insertFramePoints(campaign.id, commune.id, grid, points, now, false);
    result.communes.push({ code: commune.code, drawn, spacingM });
  }
  return result;
}

export interface SecondPhaseResult {
  campaignCode: string | null;
  communes: {
    code: string;
    firstPhase: number;
    strata: Record<FrameStratum, { firstPhase: number; selected: number }>;
  }[];
  /** Communes dont des points de première phase attendent encore la classe de la carte. */
  waiting: string[];
}

/**
 * Tire la seconde phase (ADR-0037) des communes dont tous les points de première phase ont la
 * classe de la carte : strate figée pour chaque point, `pointsPerCommune` points répartis entre
 * les strates par l'allocation de Neyman avec plancher, puis tirés systématiquement le long de
 * la grille dans chaque strate. Une commune déjà tirée n'est jamais retirée.
 */
export async function selectSecondPhase(
  options: { communeCodes?: readonly string[]; pointsPerCommune?: number } = {},
): Promise<SecondPhaseResult> {
  const campaign = await openCampaign();
  const result: SecondPhaseResult = {
    campaignCode: campaign?.code ?? null,
    communes: [],
    waiting: [],
  };
  if (!campaign) return result;
  const target = options.pointsPerCommune ?? POINTS_PER_COMMUNE;
  const rows = await pointsToStratify(campaign.id, options.communeCodes ?? null);
  const byCommune = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCommune.get(row.commune_code) ?? [];
    list.push(row);
    byCommune.set(row.commune_code, list);
  }
  for (const [code, points] of byCommune) {
    const ready = points.every(
      (point) => point.map_class !== null && point.map_method_version === CROP_AREA_METHOD_VERSION,
    );
    if (!ready) {
      result.waiting.push(code);
      continue;
    }
    // Chaque strate garde l'ordre de la grille : le tirage systématique étale ses points.
    const strata = FRAME_STRATA.map((stratum) =>
      points.filter((point) => stratumOf(point.map_class!) === stratum),
    );
    const allocation = neymanAllocation(
      strata.map((list, index) => {
        const share = ANTICIPATED_STAPLE_SHARE[FRAME_STRATA[index]!];
        return {
          candidates: list.length,
          weight: list.length / points.length,
          sd: Math.sqrt(share * (1 - share)),
        };
      }),
      target,
      MIN_POINTS_PER_STRATUM,
    );
    const updates = strata.flatMap((list, index) => {
      const stratum = FRAME_STRATA[index]!;
      const random = seededRandom(hashText(`${campaign.code}:${code}:${stratum}`));
      const chosen = new Set(systematicPositions(list.length, allocation[index]!, random));
      return list.map((point, rank) => ({ id: point.id, stratum, selected: chosen.has(rank) }));
    });
    await setPointStrata(updates);
    result.communes.push({
      code,
      firstPhase: points.length,
      strata: {
        ANNUAL_CROPS: { firstPhase: strata[0]!.length, selected: allocation[0]! },
        OTHER_LAND: { firstPhase: strata[1]!.length, selected: allocation[1]! },
      },
    });
  }
  return result;
}

export interface PointClassRunResult {
  campaignCode: string | null;
  classified: number;
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

/** Groupe de culture d'un constat, pour l'indice de la fixture. */
function observedMapClass(landCover: string | null, cropCode: string | null): string | null {
  if (landCover === "CROP" && cropCode) return cropMapClassOf(cropCode);
  if (landCover && landCover !== "INACCESSIBLE" && landCover !== "CROP") return landCover;
  return null;
}

/**
 * Lit la classe de la carte des pixels aux points qui ne l'ont pas (tâche planifiée) : une
 * requête Statistical par point, environ 0,16 unité, dans la part des statistiques.
 */
export async function classifyFramePoints(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
  /**
   * Classe de l'occupation du sol vraie, par point, pour la seule fixture de démonstration (points
   * de première phase, qui n'ont pas de constat). Jamais envoyée à Copernicus.
   */
  hints?: ReadonlyMap<string, string>;
}): Promise<PointClassRunResult> {
  const now = options.now ?? new Date();
  const result: PointClassRunResult = {
    campaignCode: null,
    classified: 0,
    errors: 0,
    processingUnits: 0,
    stopped: null,
  };
  const campaign = await openCampaign();
  if (!campaign) return result;
  result.campaignCode = campaign.code;
  const points = await pointsToClassify({
    campaignId: campaign.id,
    methodVersion: CROP_AREA_METHOD_VERSION,
    replaceSynthetic: options.provider.provenance.sourceId !== "BAIS_SEED",
    limit: options.limit,
  });
  const metered = options.provider.id === "cdse";
  const budget = processingBudget();
  const windowFrom = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const started = Date.now();
  let consecutiveErrors = 0;
  for (const point of points) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      result.stopped = "time-budget";
      break;
    }
    if (metered) {
      const reservation = await reserveProcessingRequest(periodOf(now), "STATISTICS", budget, now);
      if (reservation !== "reserved") {
        result.stopped = reservation;
        break;
      }
    }
    const hint =
      options.hints?.get(point.id) ??
      observedMapClass(point.observed_land_cover, point.observed_crop_code);
    let measure;
    try {
      measure = await options.provider.cropAreaStatistics({
        geometry: pointSquare(point.latitude, point.longitude),
        from: windowFrom.toISOString(),
        to: now.toISOString(),
        resolutionM: CROP_AREA_RESOLUTION_M,
        latitude: point.latitude,
        zoneOffset: zoneOffset(point.zone_code),
        expectedClass:
          hint && hint in CROP_CLASS_CODES
            ? CROP_CLASS_CODES[hint as keyof typeof CROP_CLASS_CODES]
            : undefined,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, point: point.code }, "Classe de la carte au point indisponible");
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
    await setPointMapClass(point.id, {
      mapClass: pointMapClass(measure.classPixels),
      methodVersion: CROP_AREA_METHOD_VERSION,
      sourceId: options.provider.provenance.sourceId,
      reliability:
        options.provider.provenance.reliability === "SYNTHETIC" ? "SYNTHETIC" : "ESTIMATED",
      computedAt: now,
    });
    result.classified += 1;
    result.processingUnits += measure.processingUnits ?? 0;
  }
  return result;
}
