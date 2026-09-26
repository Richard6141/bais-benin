import { prisma } from "@/database/client";
import {
  communeMapShares,
  surveyPoints,
  type SurveyPointRecord,
} from "@/database/sql/area-survey.sql";
import {
  combineStrata,
  estimateProportion,
  type AreaEstimate,
} from "@/lib/stats/regression-estimator";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { CROP_GROUPS, cropGroupOf } from "@/modules/satellite/crop-groups";
import {
  CROP_AREA_METHOD_VERSION,
  CULTIVATED_CLASSES,
  cropMapClassOf,
} from "@/modules/satellite/crop-areas";

// Surfaces par culture estimées par sondage (ADR-0033) : dans chaque commune d'enquête, la part
// de chaque culture vue par les agents aux points tirés, corrigée par la carte des pixels
// (estimateur par régression), puis les communes additionnées. Chaque surface a sa marge.

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
  method: "regression" | "direct" | "mixed";
  /** Rapport des variances sans et avec la carte ; null sans régression. */
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

/** Estimations par commune et pour toutes les communes réunies (fonction pure). */
export function estimateSurvey(
  points: readonly SurveyPointRecord[],
  shares: readonly {
    commune_id: string;
    crop_class: string;
    pixel_share: number;
    method_version: number;
    radar: boolean;
  }[],
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
    const targets: TargetEstimate[] = [];
    for (const target of SURVEY_TARGETS) {
      const estimate = communeTarget(target, list, first.commune_area_ha, maps.get(communeId));
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
          : (([...total.methods][0] ?? "direct") as "regression" | "direct"),
      gain: total.methods.has("regression") && variance > 0 ? total.direct / variance : null,
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
  const [points, shares] = await Promise.all([
    surveyPoints(campaign.id, null),
    communeMapShares(campaign.id),
  ]);
  if (points.length === 0) return null;
  return { campaignCode: campaign.code, ...estimateSurvey(points, shares) };
}
