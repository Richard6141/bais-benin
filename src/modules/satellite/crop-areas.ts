import { z } from "zod";
import { prisma } from "@/database/client";
import {
  communesWithMeasuredCropAreas,
  countCommunesForCropAreas,
  cropAreaEstimates,
  declaredAreasByCrop,
  listCommunesForCropAreas,
  upsertCropAreas,
  type CropAreaRow,
  type CropMapClassCode,
} from "@/database/sql/crop-areas.sql";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { logger } from "@/lib/logger";
import { scopeFilter, type Actor } from "@/modules/authorization";
import {
  RemoteSensingProviderError,
  type MultiPolygonGeometry,
  type PolygonGeometry,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { CROP_CLASS_CODES, CROP_CLASSES } from "@/services/remote-sensing";
import { zoneOffset } from "./crop-profiles";
import { processingBudget } from "./imagery";
import { periodOf } from "./periods";

// Surfaces des cultures par commune, estimées par satellite (ADR-0021, étape 3) : un histogramme
// de la classification phénologique par commune, calculé par l'API Statistical sur les 12 derniers
// mois, pixels de 100 m. Passe mensuelle : chaque lot reprend les communes pas encore calculées ce
// mois-ci (le curseur est la date du dernier calcul) et s'arrête net quand la part des statistiques
// ou le plafond d'unités est atteint. Une estimation, à confirmer par les agents.

/**
 * Pixels de 120 m (1,44 ha) : environ 11 unités par commune en moyenne, 870 par passe nationale
 * (ADR-0023). À 100 m, la passe coûterait 1 250 unités.
 */
export const CROP_AREA_RESOLUTION_M = 120;
/** Douze mois de série : une saison des pluies entière et la contre-saison qui la précède. */
const WINDOW_DAYS = 365;
const MAX_CONSECUTIVE_ERRORS = 3;

/** Classes cultivées, celles que le ministère compare au registre. */
export const CULTIVATED_CLASSES = ["RICE", "ANNUAL", "COTTON", "PERENNIAL", "GARDEN"] as const;
export type CultivatedClass = (typeof CULTIVATED_CLASSES)[number];

const PERENNIAL_CROPS = new Set(["CASHEW", "OIL_PALM", "SHEA", "PLANTAIN", "PINEAPPLE"]);
const GARDEN_CROPS = new Set(["TOMATO", "CHILI", "OKRA", "ONION"]);

/** Classe de la carte où tombe une culture du registre. */
export function cropMapClassOf(cropCode: string): CultivatedClass {
  if (cropCode === "RICE") return "RICE";
  if (cropCode === "COTTON") return "COTTON";
  if (PERENNIAL_CROPS.has(cropCode)) return "PERENNIAL";
  if (GARDEN_CROPS.has(cropCode)) return "GARDEN";
  return "ANNUAL";
}

const geometrySchema = z.union([
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.array(z.number()))),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(z.array(z.number())))),
  }),
]);

type CropAreaStop = "share-exhausted" | "units-exhausted" | "throttled" | "provider-unavailable";

export interface CropAreaRunResult {
  campaignCode: string | null;
  computed: number;
  errors: number;
  /** Unités de traitement annoncées par Copernicus, par commune calculée. */
  perCommune: { code: string; processingUnits: number | null }[];
  processingUnits: number;
  /** Communes restant à calculer ce mois-ci : le lot suivant les reprend. */
  remaining: number;
  stopped: CropAreaStop | null;
}

/** Début du mois UTC : une commune calculée depuis n'est pas refaite avant le mois suivant. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Lignes d'une commune, une par classe, à partir des pixels comptés par code de classe. */
export function cropAreaRows(
  pixels: readonly number[],
  context: {
    communeId: string;
    campaignId: string;
    communeAreaHa: number;
    windowFrom: Date;
    windowTo: Date;
    sourceId: string;
    reliability: "ESTIMATED" | "SYNTHETIC";
    computedAt: Date;
  },
): CropAreaRow[] {
  const total = pixels.reduce((sum, count) => sum + count, 0);
  const base = {
    communeId: context.communeId,
    campaignId: context.campaignId,
    resolutionM: CROP_AREA_RESOLUTION_M,
    windowFrom: context.windowFrom,
    windowTo: context.windowTo,
    sourceId: context.sourceId,
    reliability: context.reliability,
    computedAt: context.computedAt,
  };
  // Aucun pixel exploitable : la commune est marquée entièrement non classée, pour que le curseur
  // passe à la suivante au lieu de la redemander à chaque lot.
  if (total === 0) {
    return [
      {
        ...base,
        cropClass: "UNCLASSIFIED",
        areaHa: round2(context.communeAreaHa),
        pixelShare: 1,
        unclassifiedShare: 1,
      },
    ];
  }
  const unclassifiedShare = round4((pixels[0] ?? 0) / total);
  return CROP_CLASSES.map((key) => {
    const share = (pixels[CROP_CLASS_CODES[key]] ?? 0) / total;
    return {
      ...base,
      cropClass: key,
      // La part des pixels, appliquée à la surface géodésique de la commune : la même règle
      // quelle que soit la latitude.
      areaHa: round2(share * context.communeAreaHa),
      pixelShare: round4(share),
      unclassifiedShare,
    };
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export async function runCropAreaEstimates(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
}): Promise<CropAreaRunResult> {
  const now = options.now ?? new Date();
  const result: CropAreaRunResult = {
    campaignCode: null,
    computed: 0,
    errors: 0,
    perCommune: [],
    processingUnits: 0,
    remaining: 0,
    stopped: null,
  };
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return result;
  result.campaignCode = campaign.code;

  const cursor = {
    campaignId: campaign.id,
    staleBefore: monthStart(now),
    replaceSynthetic: options.provider.provenance.sourceId !== "BAIS_SEED",
  };
  const communes = await listCommunesForCropAreas({ ...cursor, limit: options.limit });
  const budget = processingBudget();
  const metered = options.provider.id === "cdse";
  const windowFrom = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  let consecutiveErrors = 0;

  for (const commune of communes) {
    const geometry = geometrySchema.safeParse(JSON.parse(commune.geometry));
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
    let measure;
    try {
      measure = await options.provider.cropAreaStatistics({
        geometry: geometry.data as PolygonGeometry | MultiPolygonGeometry,
        from: windowFrom.toISOString(),
        to: now.toISOString(),
        resolutionM: CROP_AREA_RESOLUTION_M,
        latitude: commune.latitude,
        zoneOffset: zoneOffset(commune.zone_code),
      });
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, commune: commune.code }, "Surfaces des cultures indisponibles");
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
    await upsertCropAreas(
      cropAreaRows(measure.classPixels, {
        communeId: commune.id,
        campaignId: campaign.id,
        communeAreaHa: commune.area_ha,
        windowFrom,
        windowTo: now,
        sourceId: options.provider.provenance.sourceId,
        reliability: options.provider.provenance.reliability,
        computedAt: now,
      }),
    );
    result.computed += 1;
    result.perCommune.push({ code: commune.code, processingUnits: measure.processingUnits });
    result.processingUnits += measure.processingUnits ?? 0;
  }
  result.remaining = await countCommunesForCropAreas(cursor);
  return result;
}

/**
 * Estimations de démonstration (seed, source BAIS_SEED) : sans compte Copernicus, la surface
 * « vue » par satellite est déduite des surfaces déclarées et d'un taux d'enrôlement propre à
 * chaque commune, entre 25 et 95 %. Les communes sans exploitation enregistrée reçoivent une
 * surface cultivée modeste, pour que le classement montre aussi les zones à couvrir en premier.
 */
export async function writeDemoCropAreaEstimates(now = new Date()): Promise<number> {
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true },
  });
  if (!campaign) return 0;
  const [all, declared, measured] = await Promise.all([
    listCommunesForCropAreas({
      campaignId: campaign.id,
      staleBefore: farFuture(),
      replaceSynthetic: false,
      limit: 1000,
    }),
    declaredAreasByCrop(campaign.id),
    communesWithMeasuredCropAreas(campaign.id),
  ]);
  // Une mesure réelle de Copernicus n'est jamais remplacée par la démonstration.
  const communes = all.filter((commune) => !measured.has(commune.id));
  const declaredByCommune = new Map<string, Map<CultivatedClass, number>>();
  for (const row of declared) {
    const byClass = declaredByCommune.get(row.commune_id) ?? new Map<CultivatedClass, number>();
    const key = cropMapClassOf(row.crop_code);
    byClass.set(key, (byClass.get(key) ?? 0) + row.area_ha);
    declaredByCommune.set(row.commune_id, byClass);
  }
  const windowFrom = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const rows: CropAreaRow[] = [];
  for (const commune of communes) {
    const seed = hash(commune.code);
    const rate = 0.25 + (seed % 71) / 100;
    const declaredClasses = declaredByCommune.get(commune.id);
    const hectares = new Map<CropMapClassCode, number>();
    for (const key of CULTIVATED_CLASSES) {
      const declaredHa = declaredClasses?.get(key) ?? 0;
      const fallback = declaredClasses ? 0 : demoUnregistered(key, seed, commune.latitude);
      hectares.set(key, declaredHa > 0 ? declaredHa / rate : fallback);
    }
    const cultivated = [...hectares.values()].reduce((sum, value) => sum + value, 0);
    const rest = Math.max(0, commune.area_ha - cultivated);
    const unclassified = 0.02 + (seed % 5) / 100;
    hectares.set("UNCLASSIFIED", rest * unclassified);
    hectares.set("FALLOW", rest * 0.2);
    hectares.set("WATER", rest * 0.01);
    hectares.set("BUILT", rest * 0.02);
    hectares.set("NATURAL", rest * (0.77 - unclassified));
    for (const key of CROP_CLASSES) {
      const areaHa = hectares.get(key) ?? 0;
      rows.push({
        communeId: commune.id,
        campaignId: campaign.id,
        cropClass: key,
        areaHa: round2(areaHa),
        pixelShare: commune.area_ha > 0 ? round4(areaHa / commune.area_ha) : 0,
        unclassifiedShare: round4(
          unclassified * (commune.area_ha > 0 ? rest / commune.area_ha : 0),
        ),
        resolutionM: CROP_AREA_RESOLUTION_M,
        windowFrom,
        windowTo: now,
        sourceId: "BAIS_SEED",
        reliability: "SYNTHETIC",
        computedAt: now,
      });
    }
  }
  // Par lots : une requête par commune et par classe serait inutilement lente.
  for (let index = 0; index < rows.length; index += 500) {
    await upsertCropAreas(rows.slice(index, index + 500));
  }
  return communes.length;
}

function farFuture() {
  return new Date(Date.UTC(9999, 0, 1));
}

/** Surface cultivée de démonstration d'une commune sans exploitation enregistrée, en hectares. */
function demoUnregistered(key: CultivatedClass, seed: number, latitude: number): number {
  const scale = 40 + (seed % 160);
  switch (key) {
    case "ANNUAL":
      return scale * 3;
    case "COTTON":
      return latitude >= 9 ? scale * 1.5 : 0;
    case "PERENNIAL":
      return latitude < 9 ? scale : scale * 0.6;
    case "RICE":
      return scale * 0.3;
    case "GARDEN":
      return scale * 0.1;
  }
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

// --- Vue du ministère : satellite face au registre (ADR-0021, étape 5) ----------------------------

/** En dessous, la surface vue par satellite est trop petite pour qu'un taux ait un sens. */
const MIN_SATELLITE_HA_FOR_RATE = 50;

export interface CropAreaFigures {
  satelliteHa: number;
  declaredHa: number;
  /** Surface déclarée rapportée à la surface vue ; null quand le satellite voit trop peu. */
  enrolmentRate: number | null;
  /** Surface vue mais pas encore enregistrée, en hectares (jamais négative). */
  gapHa: number;
}

export interface CropAreaComparison {
  campaignCode: string;
  cropClass: CultivatedClass | null;
  totals: CropAreaFigures & { communes: number; estimatedCommunes: number };
  byClass: (CropAreaFigures & { cropClass: CultivatedClass })[];
  departements: (CropAreaFigures & { code: string; name: string })[];
  /** Communes au plus gros écart d'abord : où envoyer les agents. */
  communes: (CropAreaFigures & {
    code: string;
    name: string;
    departementName: string;
    unclassifiedShare: number;
  })[];
  sources: { sourceId: string; computedAt: Date; resolutionM: number }[];
}

function figures(satelliteHa: number, declaredHa: number): CropAreaFigures {
  const round = (value: number) => Math.round(value);
  return {
    satelliteHa: round(satelliteHa),
    declaredHa: round(declaredHa),
    enrolmentRate: satelliteHa >= MIN_SATELLITE_HA_FOR_RATE ? declaredHa / satelliteHa : null,
    gapHa: round(Math.max(0, satelliteHa - declaredHa)),
  };
}

/**
 * Surfaces vues par satellite par culture et par zone, face aux surfaces déclarées au registre,
 * pour la campagne ouverte : taux d'enrôlement et communes au plus gros écart. Ministère
 * seulement (portée nationale sur le registre) ; des hectares par commune, aucun producteur.
 */
export async function getCropAreaComparison(
  actor: Actor,
  filters: { departementCode?: string; cropClass?: string } = {},
): Promise<CropAreaComparison | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;
  const cropClass = (CULTIVATED_CLASSES as readonly string[]).includes(filters.cropClass ?? "")
    ? (filters.cropClass as CultivatedClass)
    : null;
  const classes: readonly CultivatedClass[] = cropClass ? [cropClass] : CULTIVATED_CLASSES;

  const [estimates, declared] = await Promise.all([
    cropAreaEstimates(campaign.id),
    declaredAreasByCrop(campaign.id),
  ]);
  const rows = filters.departementCode
    ? estimates.filter((row) => row.departement_code === filters.departementCode)
    : estimates;

  const declaredBy = new Map<string, number>();
  for (const row of declared) {
    const key = `${row.commune_id}:${cropMapClassOf(row.crop_code)}`;
    declaredBy.set(key, (declaredBy.get(key) ?? 0) + row.area_ha);
  }

  interface CommuneAccumulator {
    code: string;
    name: string;
    departementCode: string;
    departementName: string;
    satellite: number;
    declared: number;
    unclassifiedShare: number;
  }
  const communes = new Map<string, CommuneAccumulator>();
  const byClass = new Map<CultivatedClass, { satellite: number; declared: number }>(
    classes.map((key) => [key, { satellite: 0, declared: 0 }]),
  );
  const sources = new Map<string, { computedAt: Date; resolutionM: number }>();

  for (const row of rows) {
    const known = sources.get(row.source_id);
    if (!known || row.computed_at > known.computedAt) {
      sources.set(row.source_id, { computedAt: row.computed_at, resolutionM: row.resolution_m });
    }
    const commune = communes.get(row.commune_id) ?? {
      code: row.commune_code,
      name: row.commune_name,
      departementCode: row.departement_code,
      departementName: row.departement_name,
      satellite: 0,
      declared: 0,
      unclassifiedShare: row.unclassified_share,
    };
    communes.set(row.commune_id, commune);
    const key = row.crop_class as CultivatedClass;
    const total = byClass.get(key);
    if (!total) continue;
    const declaredHa = declaredBy.get(`${row.commune_id}:${key}`) ?? 0;
    commune.satellite += row.area_ha;
    commune.declared += declaredHa;
    total.satellite += row.area_ha;
    total.declared += declaredHa;
  }

  const departements = new Map<string, { name: string; satellite: number; declared: number }>();
  for (const commune of communes.values()) {
    const entry = departements.get(commune.departementCode) ?? {
      name: commune.departementName,
      satellite: 0,
      declared: 0,
    };
    entry.satellite += commune.satellite;
    entry.declared += commune.declared;
    departements.set(commune.departementCode, entry);
  }

  const satellite = [...byClass.values()].reduce((sum, entry) => sum + entry.satellite, 0);
  const declaredTotal = [...byClass.values()].reduce((sum, entry) => sum + entry.declared, 0);
  const communeCount = await prisma.commune.count({
    where: {
      archivedAt: null,
      ...(filters.departementCode ? { departement: { code: filters.departementCode } } : {}),
    },
  });
  return {
    campaignCode: campaign.code,
    cropClass,
    totals: {
      ...figures(satellite, declaredTotal),
      communes: communeCount,
      estimatedCommunes: communes.size,
    },
    byClass: [...byClass.entries()].map(([key, entry]) => ({
      cropClass: key,
      ...figures(entry.satellite, entry.declared),
    })),
    departements: [...departements.entries()]
      .map(([code, entry]) => ({
        code,
        name: entry.name,
        ...figures(entry.satellite, entry.declared),
      }))
      .sort((a, b) => b.gapHa - a.gapHa),
    communes: [...communes.values()]
      .map((commune) => ({
        code: commune.code,
        name: commune.name,
        departementName: commune.departementName,
        unclassifiedShare: commune.unclassifiedShare,
        ...figures(commune.satellite, commune.declared),
      }))
      .sort((a, b) => b.gapHa - a.gapHa),
    sources: [...sources.entries()].map(([sourceId, entry]) => ({ sourceId, ...entry })),
  };
}
