import { prisma } from "@/database/client";
import {
  communeMapShares,
  frameStrata,
  surveyPoints,
  type FrameStratumRecord,
  type SurveyPointRecord,
} from "@/database/sql/area-survey.sql";
import {
  combineStrata,
  estimateProportion,
  type AreaEstimate,
} from "@/lib/stats/regression-estimator";
import { compatibleWeights, estimateStratifiedProportion } from "@/lib/stats/stratified-estimator";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { CROP_GROUPS, cropGroupOf } from "@/modules/satellite/crop-groups";
import {
  CROP_AREA_METHOD_VERSION,
  CULTIVATED_CLASSES,
  cropMapClassOf,
} from "@/modules/satellite/crop-areas";
import { ANNUAL_STRATUM_CLASSES, FRAME_STRATA, type FrameStratum } from "./strata";

// Surfaces par culture estimées par sondage : dans chaque commune d'enquête, la part de chaque
// culture vue par les agents aux points tirés, puis les communes additionnées. Chaque surface a
// sa marge. Commune tirée en deux phases (ADR-0037) : estimateur stratifié, chaque point pesant
// les hectares de sa strate. Commune tirée à égale probabilité (ADR-0033) : moyenne des points
// corrigée par la carte des pixels (estimateur par régression).

/** Sous ce nombre de points observés, une surface n'est jamais à citer. */
export const MIN_POINTS_TO_CITE = 30;
/**
 * Sous ce nombre de points où la culture est vue, la variance n'est pas fiable : deux points de
 * riz que la carte voit aussi donnent une marge nulle. Le chiffre n'est alors jamais cité.
 */
export const MIN_POSITIVES_TO_CITE = 10;
/** Coefficients de variation : à citer, indicatif, au-delà à ne pas citer. */
export const CV_CITE = 0.1;
export const CV_INDICATIVE = 0.2;
/** Au-delà de cette part de points inaccessibles, la commune est signalée. */
export const MAX_NON_RESPONSE = 0.1;

/** Classes dont la part change quand le radar corrige le riz (ADR-0026). */
const RADAR_ADJUSTED = new Set(["RICE", "ANNUAL", "FALLOW", "NATURAL"]);

/** Classes de la carte qui portent plusieurs classes du modèle de culture. */
const SHARED_CLASSES = new Set<string>(
  CROP_GROUPS.map((group) => cropMapClassOf(group.crops[0])).filter(
    (key, index, all) => all.indexOf(key) !== index,
  ),
);

/** Cibles : chaque classe du modèle de culture, et l'ensemble des terres cultivées. */
export const SURVEY_TARGETS = [
  ...CROP_GROUPS.map((group) => group.key),
  "STAPLES",
  "CULTIVATED",
] as const;

/**
 * Céréales, racines et tubercules (ADR-0035) : la base du bilan alimentaire. Réunies, elles sont
 * vues sur assez de points pour une marge étroite, même là où chaque culture seule ne l'est pas.
 */
export const STAPLE_GROUPS = ["MAIZE", "SORGHUM_MILLET", "RICE", "ROOTS"] as const;
export type SurveyTarget = (typeof SURVEY_TARGETS)[number];

export type CitationStatus = "cite" | "indicative" | "do-not-cite";

export interface TargetEstimate extends AreaEstimate {
  target: SurveyTarget;
  /** Points observés (hors inaccessibles) ayant servi au calcul. */
  points: number;
  /** Points où l'agent a vu la cible. */
  positives: number;
  method: "regression" | "direct" | "stratified" | "mixed";
  /**
   * Rapport des variances sans et avec la carte : estimateur direct contre régression, ou tirage
   * simple de même taille contre tirage stratifié. Null sans l'une ou l'autre.
   */
  gain: number | null;
  /** Surface que la carte des pixels donne seule ; null sans carte pour la campagne. */
  mapHa: number | null;
  /**
   * Vrai si cette surface est celle d'une classe de la carte partagée par plusieurs cultures
   * (maïs, soja, niébé et igname tombent tous dans « cultures annuelles »).
   */
  mapShared: boolean;
  status: CitationStatus;
}

export interface CommuneSurvey {
  communeId: string;
  code: string;
  name: string;
  drawn: number;
  observed: number;
  inaccessible: number;
  mapped: number;
  /** Part des points visités qui ont pu être observés ; null avant toute visite. */
  responseRate: number | null;
  /** Tirage en deux phases stratifié par la carte (ADR-0037), ou à égale probabilité (ADR-0033). */
  design: "stratified" | "simple";
  /**
   * Strates d'un tirage en deux phases : points de première phase, points à visiter, points
   * constatés et hectares que pèse chaque point constaté. Vide pour un tirage simple.
   */
  strata: {
    stratum: FrameStratum;
    firstPhase: number;
    drawn: number;
    observed: number;
    weightHa: number | null;
  }[];
  /** Vrai si les poids des strates viennent de la carte de la commune, faux s'ils sont estimés. */
  weightsKnown: boolean | null;
  targets: TargetEstimate[];
}

export interface SurveyEstimates {
  drawn: number;
  observed: number;
  inaccessible: number;
  communes: CommuneSurvey[];
  totals: TargetEstimate[];
  /** Vrai si des constats ou des classes de la carte viennent de la démonstration. */
  synthetic: boolean;
}

/** Classes de la carte qui portent une cible. */
function mapClassesOf(target: SurveyTarget): readonly string[] {
  if (target === "CULTIVATED") return CULTIVATED_CLASSES;
  if (target === "STAPLES") return ["ANNUAL", "RICE"];
  const crops = CROP_GROUPS.find((group) => group.key === target)?.crops ?? [];
  return [cropMapClassOf(crops[0] ?? target)];
}

/** Vrai si l'agent a vu la cible au point. */
function seen(point: SurveyPointRecord, target: SurveyTarget): boolean {
  if (point.land_cover !== "CROP") return false;
  if (target === "CULTIVATED") return true;
  const group = point.crop_code ? cropGroupOf(point.crop_code) : null;
  if (target === "STAPLES") return (STAPLE_GROUPS as readonly string[]).includes(group ?? "");
  return group === target;
}

export function citationStatus(
  cv: number | null,
  points: number,
  positives: number,
): CitationStatus {
  if (points < MIN_POINTS_TO_CITE || positives < MIN_POSITIVES_TO_CITE || cv === null) {
    return "do-not-cite";
  }
  if (cv <= CV_CITE) return "cite";
  if (cv <= CV_INDICATIVE) return "indicative";
  return "do-not-cite";
}

interface CommuneShares {
  shares: Map<string, number>;
  methodVersion: number;
  radar: boolean;
}

/** Estimation d'une cible dans une commune ; null sous trois points observés. */
function communeTarget(
  target: SurveyTarget,
  points: readonly SurveyPointRecord[],
  areaHa: number,
  map: CommuneShares | undefined,
): (TargetEstimate & { varianceHa2: number; directVarianceHa2: number }) | null {
  const sample = points.filter(
    (point) => point.land_cover !== null && point.land_cover !== "INACCESSIBLE",
  );
  const classes = mapClassesOf(target);
  const mapUsable =
    map !== undefined &&
    map.methodVersion === CROP_AREA_METHOD_VERSION &&
    !(map.radar && classes.some((key) => RADAR_ADJUSTED.has(key))) &&
    sample.every(
      (point) => point.map_class !== null && point.map_method_version === CROP_AREA_METHOD_VERSION,
    );
  const populationMean = map
    ? classes.reduce((sum, key) => sum + (map.shares.get(key) ?? 0), 0)
    : null;
  const positives = sample.filter((point) => seen(point, target)).length;
  const estimate = estimateProportion(
    sample.map((point) => (seen(point, target) ? 1 : 0)),
    mapUsable ? sample.map((point) => (classes.includes(point.map_class!) ? 1 : 0)) : null,
    mapUsable ? populationMean : null,
  );
  if (!estimate) return null;
  const varianceHa2 = areaHa * areaHa * estimate.variance;
  const directVarianceHa2 = areaHa * areaHa * estimate.directVariance;
  const area = combineStrata([{ areaHa: areaHa * estimate.proportion, varianceHa2 }]);
  return {
    target,
    ...area,
    points: estimate.n,
    positives,
    method: estimate.method,
    gain:
      estimate.method === "regression" && estimate.variance > 0
        ? estimate.directVariance / estimate.variance
        : null,
    mapHa: populationMean === null ? null : areaHa * populationMean,
    mapShared: target !== "CULTIVATED" && classes.some((key) => SHARED_CLASSES.has(key)),
    status: citationStatus(area.cv, estimate.n, positives),
    varianceHa2,
    directVarianceHa2,
  };
}

interface CommuneDesign {
  /** Points de première phase de chaque strate, dans l'ordre de FRAME_STRATA. */
  firstPhase: number[];
  /** Poids des strates connus par la carte de la commune ; null s'ils viennent de la 1re phase. */
  weights: number[] | null;
}

/**
 * Plan d'une commune tirée en deux phases (ADR-0037 §4) : les poids des strates sont ceux de la
 * carte de la commune si elle est de la même méthode que les points, sans correction radar, et
 * s'accorde avec la première phase ; sinon ceux de la première phase.
 */
function communeDesign(
  counts: readonly FrameStratumRecord[],
  map: CommuneShares | undefined,
  points: readonly SurveyPointRecord[],
): CommuneDesign {
  const firstPhase = FRAME_STRATA.map(
    (stratum) => counts.find((row) => row.stratum === stratum)?.first_phase ?? 0,
  );
  const usable =
    map !== undefined &&
    map.methodVersion === CROP_AREA_METHOD_VERSION &&
    !map.radar &&
    points.every((point) => point.map_method_version === map.methodVersion);
  if (!usable) return { firstPhase, weights: null };
  const annual = ANNUAL_STRATUM_CLASSES.reduce((sum, key) => sum + (map.shares.get(key) ?? 0), 0);
  return { firstPhase, weights: compatibleWeights([annual, 1 - annual], firstPhase) };
}

/** Estimation stratifiée d'une cible dans une commune tirée en deux phases ; null sans calcul. */
function stratifiedTarget(
  target: SurveyTarget,
  points: readonly SurveyPointRecord[],
  areaHa: number,
  map: CommuneShares | undefined,
  design: CommuneDesign,
): (TargetEstimate & { varianceHa2: number; directVarianceHa2: number }) | null {
  const sample = points.filter(
    (point) => point.land_cover !== null && point.land_cover !== "INACCESSIBLE",
  );
  const estimate = estimateStratifiedProportion(
    FRAME_STRATA.map((stratum, index) => ({
      firstPhase: design.firstPhase[index]!,
      values: sample
        .filter((point) => point.stratum === stratum)
        .map((point) => (seen(point, target) ? 1 : 0)),
    })),
    design.weights,
  );
  if (!estimate) return null;
  const classes = mapClassesOf(target);
  const populationMean = map
    ? classes.reduce((sum, key) => sum + (map.shares.get(key) ?? 0), 0)
    : null;
  const positives = sample.filter((point) => seen(point, target)).length;
  const varianceHa2 = areaHa * areaHa * estimate.variance;
  const area = combineStrata([{ areaHa: areaHa * estimate.proportion, varianceHa2 }]);
  return {
    target,
    ...area,
    points: estimate.n,
    positives,
    method: "stratified",
    gain: estimate.variance > 0 ? estimate.simpleVariance / estimate.variance : null,
    mapHa: populationMean === null ? null : areaHa * populationMean,
    mapShared: target !== "CULTIVATED" && classes.some((key) => SHARED_CLASSES.has(key)),
    status: citationStatus(area.cv, estimate.n, positives),
    varianceHa2,
    directVarianceHa2: areaHa * areaHa * estimate.simpleVariance,
  };
}

/** Strates d'une commune tirée en deux phases, pour l'affichage : points et poids de sondage. */
function communeStrata(
  points: readonly SurveyPointRecord[],
  areaHa: number,
  design: CommuneDesign,
): CommuneSurvey["strata"] {
  const firstPhase = design.firstPhase.reduce((sum, value) => sum + value, 0);
  return FRAME_STRATA.map((stratum, index) => {
    const drawn = points.filter((point) => point.stratum === stratum);
    const observed = drawn.filter(
      (point) => point.land_cover !== null && point.land_cover !== "INACCESSIBLE",
    ).length;
    const weight = design.weights?.[index] ?? design.firstPhase[index]! / Math.max(1, firstPhase);
    return {
      stratum,
      firstPhase: design.firstPhase[index]!,
      drawn: drawn.length,
      observed,
      weightHa: observed > 0 ? (areaHa * weight) / observed : null,
    };
  });
}

/**
 * Estimations par commune et pour toutes les communes réunies (fonction pure). `strata` : les
 * points de première phase par strate des communes tirées en deux phases (ADR-0037) ; une commune
 * absente de cette liste a été tirée à égale probabilité (ADR-0033).
 */
export function estimateSurvey(
  points: readonly SurveyPointRecord[],
  shares: readonly {
    commune_id: string;
    crop_class: string;
    pixel_share: number;
    method_version: number;
    radar: boolean;
  }[],
  strata: readonly FrameStratumRecord[] = [],
): SurveyEstimates {
  const maps = new Map<string, CommuneShares>();
  for (const row of shares) {
    const map = maps.get(row.commune_id) ?? {
      shares: new Map<string, number>(),
      methodVersion: row.method_version,
      radar: row.radar,
    };
    map.shares.set(row.crop_class, row.pixel_share);
    maps.set(row.commune_id, map);
  }
  const byCommune = new Map<string, SurveyPointRecord[]>();
  for (const point of points) {
    const list = byCommune.get(point.commune_id) ?? [];
    list.push(point);
    byCommune.set(point.commune_id, list);
  }
  const strataByCommune = new Map<string, FrameStratumRecord[]>();
  for (const row of strata) {
    const list = strataByCommune.get(row.commune_id) ?? [];
    list.push(row);
    strataByCommune.set(row.commune_id, list);
  }

  const perTarget = new Map<
    SurveyTarget,
    {
      strata: { areaHa: number; varianceHa2: number }[];
      direct: number;
      points: number;
      positives: number;
      methods: Set<string>;
      mapHa: number | null;
    }
  >();
  const communes: CommuneSurvey[] = [];
  for (const [communeId, list] of byCommune) {
    const first = list[0]!;
    const observed = list.filter((point) => point.land_cover !== null);
    const inaccessible = observed.filter((point) => point.land_cover === "INACCESSIBLE").length;
    const map = maps.get(communeId);
    const counts = strataByCommune.get(communeId);
    const design = counts ? communeDesign(counts, map, list) : null;
    const targets: TargetEstimate[] = [];
    for (const target of SURVEY_TARGETS) {
      const estimate = design
        ? stratifiedTarget(target, list, first.commune_area_ha, map, design)
        : communeTarget(target, list, first.commune_area_ha, map);
      if (!estimate) continue;
      const { varianceHa2, directVarianceHa2, ...visible } = estimate;
      targets.push(visible);
      const total = perTarget.get(target) ?? {
        strata: [],
        direct: 0,
        points: 0,
        positives: 0,
        methods: new Set<string>(),
        mapHa: 0,
      };
      total.strata.push({ areaHa: estimate.areaHa, varianceHa2 });
      total.direct += directVarianceHa2;
      total.points += estimate.points;
      total.positives += estimate.positives;
      total.methods.add(estimate.method);
      total.mapHa =
        total.mapHa === null || estimate.mapHa === null ? null : total.mapHa + estimate.mapHa;
      perTarget.set(target, total);
    }
    communes.push({
      communeId,
      code: first.commune_code,
      name: first.commune_name,
      drawn: list.length,
      observed: observed.length - inaccessible,
      inaccessible,
      mapped: list.filter((point) => point.map_class !== null).length,
      responseRate: observed.length > 0 ? (observed.length - inaccessible) / observed.length : null,
      design: design ? "stratified" : "simple",
      strata: design ? communeStrata(list, first.commune_area_ha, design) : [],
      weightsKnown: design ? design.weights !== null : null,
      targets,
    });
  }

  const totals: TargetEstimate[] = [...perTarget.entries()].map(([target, total]) => {
    const area = combineStrata(total.strata);
    const variance = area.standardErrorHa ** 2;
    return {
      target,
      ...area,
      points: total.points,
      positives: total.positives,
      method:
        total.methods.size > 1
          ? "mixed"
          : (([...total.methods][0] ?? "direct") as "regression" | "direct" | "stratified"),
      gain:
        (total.methods.has("regression") || total.methods.has("stratified")) && variance > 0
          ? total.direct / variance
          : null,
      mapHa: total.mapHa,
      mapShared:
        target !== "CULTIVATED" && mapClassesOf(target).some((key) => SHARED_CLASSES.has(key)),
      status: citationStatus(area.cv, total.points, total.positives),
    };
  });

  return {
    drawn: points.length,
    observed: communes.reduce((sum, commune) => sum + commune.observed, 0),
    inaccessible: communes.reduce((sum, commune) => sum + commune.inaccessible, 0),
    communes: communes.sort((a, b) => a.name.localeCompare(b.name)),
    totals,
    synthetic: points.some(
      (point) => point.map_source_id === "BAIS_SEED" || point.observation_source_id === "BAIS_SEED",
    ),
  };
}

/**
 * Surfaces par culture estimées par sondage, pour le ministère (portée nationale) : null hors de
 * cette portée, sans campagne ouverte ou sans point tiré.
 */
export async function getSurveyEstimates(
  actor: Actor,
): Promise<(SurveyEstimates & { campaignCode: string }) | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;
  const [points, shares, strata] = await Promise.all([
    surveyPoints(campaign.id, null),
    communeMapShares(campaign.id),
    frameStrata(campaign.id),
  ]);
  if (points.length === 0) return null;
  return { campaignCode: campaign.code, ...estimateSurvey(points, shares, strata) };
}
