import { prisma } from "@/database/client";
import { communeMapShares, surveyPoints } from "@/database/sql/area-survey.sql";
import { readSownAreas, readYieldHistory } from "@/database/sql/forecast.sql";
import { indexYields, yieldReference } from "@/modules/analytics/forecast";
import { estimateSurvey, type TargetEstimate } from "@/modules/area-survey";
import { scopeFilter, type Actor } from "@/modules/authorization";
import {
  STATUS_RANK,
  computeCommuneBalance,
  type BalanceStatus,
  type CommuneBalance,
  type CropInput,
} from "./balance";
import { FOOD_CROPS, annualStapleNeedsKcal, kcalFromProduction } from "./coefficients";

// Bilan alimentaire prévisionnel par commune (ADR-0035) : pour chaque commune, la surface de
// chaque culture vivrière dans toute la commune (enquête aréolaire, sinon statistique DSA), le
// rendement de référence de l'ADR-0020, la population WorldPop, puis la couverture des besoins.
// Au sondage, la surface est celle des céréales, racines et tubercules réunies, répartie entre les
// cultures selon les points où l'agent les a vues. Le registre seul ne fait jamais de bilan : il ne
// sert qu'à répartir une commune d'enquête dont aucun point n'a vu de culture vivrière.

/**
 * Sous ce nombre de points où l'agent a vu une culture vivrière, la surface par sondage n'est que
 * du bruit : la commune n'est pas évaluée. Au-dessus, une surface imprécise (CV de plus de 20 %)
 * sert quand même, et la commune est « à confirmer » (ADR-0036).
 */
const MIN_STAPLE_POINTS = 5;

export interface FoodBalanceView {
  campaignCode: string;
  historyCampaigns: string[];
  population: { year: number; dataset: string } | null;
  communes: CommuneBalance[];
  counts: Record<BalanceStatus, number>;
  /** Même calcul sur la production nationale de FAOSTAT, s'il est importé (ADR-0034). */
  nationalCheck: { year: string; coverage: number; populationYear: number } | null;
}

function surveyArea(target: TargetEstimate | undefined) {
  if (!target || target.cv === null || target.positives < MIN_STAPLE_POINTS) return null;
  return {
    areaHa: target.areaHa,
    lowHa: Math.max(0, target.areaHa - target.marginHa),
    highHa: target.areaHa + target.marginHa,
    cv: target.cv,
    positives: target.positives,
    points: target.points,
  };
}

/** « 1 point vivrier », « 4 points vivriers ». */
export function pointsLabel(count: number): string {
  return count > 1 ? `${count} points vivriers` : `${count} point vivrier`;
}

/** Raison d'une commune d'enquête dont les points vivriers sont trop peu nombreux. */
function thinSurvey(targets: readonly TargetEstimate[]): string | undefined {
  const staples = targets.find((target) => target.target === "STAPLES");
  if (!staples || staples.positives >= MIN_STAPLE_POINTS) return undefined;
  return `Enquête : ${pointsLabel(staples.positives)} sur ${staples.points}, trop peu pour une surface`;
}

/** Vue du ministère ; null hors de la portée nationale ou sans campagne ouverte. */
export async function getFoodBalance(actor: Actor): Promise<FoodBalanceView | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaigns = await prisma.agriculturalCampaign.findMany({
    select: { id: true, code: true, status: true, startsOn: true },
    orderBy: { startsOn: "asc" },
  });
  const open = campaigns.find((campaign) => campaign.status === "OPEN");
  if (!open) return null;
  const history = campaigns
    .filter((campaign) => campaign.status === "CLOSED" && campaign.startsOn < open.startsOn)
    .slice(-2);

  const [communes, populations, crops, sown, yields, mapShares, official, faostat, points] =
    await Promise.all([
      prisma.commune.findMany({
        where: { archivedAt: null },
        select: { id: true, code: true, name: true, departement: { select: { code: true } } },
      }),
      prisma.communePopulation.findMany({
        select: { communeId: true, year: true, population: true, dataset: true },
        orderBy: { year: "desc" },
      }),
      prisma.crop.findMany({
        where: { code: { in: FOOD_CROPS.map((crop) => crop.cropCode) } },
        select: { code: true, typicalYieldTPerHa: true },
      }),
      readSownAreas([open.id]),
      readYieldHistory(history.map((campaign) => campaign.id)),
      communeMapShares(open.id),
      // Dernière surface DSA connue par commune et culture.
      prisma.$queryRaw<
        { territory_code: string; crop_code: string; campaign_code: string; value: number }[]
      >`
        SELECT DISTINCT ON (s."territory_code", c."code")
               s."territory_code", c."code" AS crop_code, s."campaign_code", s."value"::float8 AS value
          FROM "official_crop_statistic" s
          JOIN "crop" c ON c."id" = s."crop_id"
         WHERE s."source_id" = 'MAEP_DSA' AND s."level" = 'COMMUNE' AND s."metric" = 'AREA_HA'
         ORDER BY s."territory_code", c."code", s."campaign_code" DESC`,
      prisma.$queryRaw<
        { campaign_code: string; crop_code: string; metric: string; value: number }[]
      >`
        SELECT s."campaign_code", c."code" AS crop_code, s."metric"::text AS metric,
               s."value"::float8 AS value
          FROM "official_crop_statistic" s
          JOIN "crop" c ON c."id" = s."crop_id"
         WHERE s."source_id" = 'FAOSTAT' AND s."territory_code" = 'BJ'
           AND s."metric" IN ('AREA_HA', 'PRODUCTION_T')`,
      surveyPoints(open.id, null),
    ]);

  // Les points du sondage, lus une seule fois, servent à l'estimation et à la répartition.
  const survey =
    points.length > 0 ? { campaignCode: open.code, ...estimateSurvey(points, mapShares) } : null;

  const population = new Map<string, number>();
  let populationInfo: FoodBalanceView["population"] = null;
  for (const row of populations) {
    if (population.has(row.communeId)) continue;
    population.set(row.communeId, row.population);
    populationInfo ??= { year: row.year, dataset: row.dataset };
  }
  const typical = new Map(crops.map((crop) => [crop.code, Number(crop.typicalYieldTPerHa ?? 0)]));
  const yieldIndex = indexYields(yields);

  // Surfaces déclarées au registre par commune : elles ne répartissent une surface par sondage que
  // si aucun point de la commune n'a vu de culture vivrière.
  const declared = new Map<string, number>();
  for (const row of sown) {
    declared.set(`${row.commune_code}|${row.crop_code}`, row.area_ha);
  }
  const seenCounts = new Map<string, Map<string, number>>();
  for (const point of points) {
    if (point.land_cover !== "CROP" || !point.crop_code) continue;
    if (!FOOD_CROPS.some((crop) => crop.cropCode === point.crop_code)) continue;
    const counts = seenCounts.get(point.commune_code) ?? new Map<string, number>();
    counts.set(point.crop_code, (counts.get(point.crop_code) ?? 0) + 1);
    seenCounts.set(point.commune_code, counts);
  }
  /** Part d'une culture dans les cultures vivrières vues aux points, sinon déclarées au registre. */
  const stapleShare = (communeCode: string, cropCode: string): number => {
    const counts = seenCounts.get(communeCode);
    const seenTotal = counts ? [...counts.values()].reduce((sum, value) => sum + value, 0) : 0;
    if (seenTotal > 0) return (counts!.get(cropCode) ?? 0) / seenTotal;
    const declaredTotal = FOOD_CROPS.reduce(
      (sum, crop) => sum + (declared.get(`${communeCode}|${crop.cropCode}`) ?? 0),
      0,
    );
    return declaredTotal > 0
      ? (declared.get(`${communeCode}|${cropCode}`) ?? 0) / declaredTotal
      : 1 / FOOD_CROPS.length;
  };

  const surveyByCommune = new Map(
    (survey?.communes ?? []).map((commune) => [commune.code, commune.targets]),
  );
  const officialBy = new Map(
    official.map((row) => [`${row.territory_code}|${row.crop_code}`, row]),
  );

  const balances = communes.map((commune) => {
    const targets = surveyByCommune.get(commune.code) ?? [];
    const inputs: CropInput[] = [];
    const missing: string[] = [];
    const measured = surveyArea(targets.find((target) => target.target === "STAPLES"));
    for (const crop of FOOD_CROPS) {
      const yieldRef = yieldReference(yieldIndex, {
        crop_code: crop.cropCode,
        commune_id: commune.id,
        departement_code: commune.departement.code,
        typical_yield_t_per_ha: typical.get(crop.cropCode) ?? 0,
      });
      if (measured && survey) {
        const share = stapleShare(commune.code, crop.cropCode);
        inputs.push({
          cropCode: crop.cropCode,
          areaHa: measured.areaHa * share,
          areaLowHa: measured.lowHa * share,
          areaHighHa: measured.highHa * share,
          source: {
            kind: "survey",
            campaignCode: survey.campaignCode,
            cv: measured.cv,
            positives: measured.positives,
            points: measured.points,
          },
          yieldRef: { ...yieldRef, basis: yieldRef.basis },
        });
        continue;
      }
      const stat = officialBy.get(`${commune.code}|${crop.cropCode}`);
      if (stat) {
        inputs.push({
          cropCode: crop.cropCode,
          areaHa: stat.value,
          areaLowHa: stat.value,
          areaHighHa: stat.value,
          source: { kind: "official", sourceId: "MAEP_DSA", campaignCode: stat.campaign_code },
          yieldRef: { ...yieldRef, basis: yieldRef.basis },
        });
        continue;
      }
      missing.push(crop.cropCode);
    }
    return computeCommuneBalance({
      code: commune.code,
      name: commune.name,
      population: population.get(commune.id) ?? null,
      crops: missing.length === FOOD_CROPS.length ? [] : inputs,
      missingCrops: missing,
      unavailableReason: thinSurvey(targets),
    });
  });

  balances.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (a.coverage?.central ?? 0) - (b.coverage?.central ?? 0) ||
      a.name.localeCompare(b.name, "fr"),
  );
  const counts: Record<BalanceStatus, number> = {
    deficit: 0,
    tension: 0,
    covered: 0,
    "not-evaluated": 0,
  };
  for (const balance of balances) counts[balance.status] += 1;

  // Contrôle national : la dernière année FAOSTAT qui a surface et production pour les cultures.
  let nationalCheck: FoodBalanceView["nationalCheck"] = null;
  const years = [...new Set(faostat.map((row) => row.campaign_code))].sort().reverse();
  const nationalPopulation = [...population.values()].reduce((sum, value) => sum + value, 0);
  for (const year of years) {
    let kcal = 0;
    let found = 0;
    for (const crop of FOOD_CROPS) {
      const area = faostat.find(
        (row) =>
          row.campaign_code === year && row.crop_code === crop.cropCode && row.metric === "AREA_HA",
      );
      const production = faostat.find(
        (row) =>
          row.campaign_code === year &&
          row.crop_code === crop.cropCode &&
          row.metric === "PRODUCTION_T",
      );
      if (!area || !production) continue;
      kcal += kcalFromProduction(crop, production.value, area.value);
      found += 1;
    }
    if (found >= 5 && nationalPopulation > 0 && populationInfo) {
      nationalCheck = {
        year,
        coverage: kcal / annualStapleNeedsKcal(nationalPopulation),
        populationYear: populationInfo.year,
      };
      break;
    }
  }

  return {
    campaignCode: open.code,
    historyCampaigns: history.map((campaign) => campaign.code),
    population: populationInfo,
    communes: balances,
    counts,
    nationalCheck,
  };
}
