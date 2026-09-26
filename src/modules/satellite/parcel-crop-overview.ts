import { z } from "zod";
import { prisma } from "@/database/client";
import { cropAreaEstimates } from "@/database/sql/crop-areas.sql";
import {
  listPredictionDisagreements,
  measuredCropAreas,
  predictionAgreementCounts,
} from "@/database/sql/parcel-crops.sql";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { CROP_GROUPS } from "./crop-groups";
import { cropMapClassOf, type CultivatedClass } from "./crop-areas";
import { crossValidationSchema, groupConfusion, type GroupConfusion } from "./parcel-crop-accuracy";

// Cultures mesurées par parcelle, vue du ministère (ADR-0032) : la précision du modèle jugée sur
// des communes qu'il n'a jamais vues, l'accord avec les déclarations, les désaccords à vérifier
// et les surfaces par culture face à la carte des pixels. Des parcelles par leur code, aucun
// producteur.

const DISAGREEMENTS_SHOWN = 20;
/** En dessous, la carte des pixels voit trop peu pour qu'une part ait un sens. */
const MIN_MAP_HA_FOR_SHARE = 50;

const metricsSchema = z.object({
  fieldVisitLabels: z.number().optional(),
  crossValidation: crossValidationSchema.nullable().optional(),
});

export interface ParcelCropOverview {
  campaignCode: string;
  model: {
    version: number;
    trainedAt: Date;
    trainingParcels: number;
    fieldVisitLabels: number;
    synthetic: boolean;
  };
  /** Validation croisée par commune ; null avant le premier modèle qui l'a calculée. */
  accuracy:
    | (GroupConfusion & {
        folds: number;
        /** Parcelles jugées avec une confiance d'au moins 60 %, et leur précision. */
        confident: { judged: number; share: number | null; accuracy: number | null };
        communes: { code: string; name: string; judged: number; accuracy: number | null }[];
      })
    | null;
  agreement: {
    parcels: number;
    agrees: number;
    differs: number;
    uncertain: number;
    byCrop: {
      group: string;
      parcels: number;
      agrees: number;
      differs: number;
      uncertain: number;
      agreementRate: number | null;
    }[];
  };
  disagreements: {
    parcelId: string;
    parcelCode: string;
    communeName: string;
    measuredGroup: string;
    declaredGroup: string | null;
    confidence: number;
  }[];
  areas: {
    byCrop: {
      group: string;
      classifiedParcels: number;
      classifiedHa: number;
      weightedHa: number;
      declaredHa: number;
    }[];
    /** Par commune et par classe de la carte : parcelles mesurées face aux pixels. */
    byCommune: {
      communeCode: string;
      communeName: string;
      cropClass: CultivatedClass;
      measuredHa: number;
      mapHa: number | null;
      /** Part de la surface vue par les pixels couverte par les parcelles mesurées. */
      share: number | null;
    }[];
  };
}

const rateOf = (part: number, whole: number, minimum = 10) =>
  whole >= minimum ? part / whole : null;
const hectares = (value: number) => Math.round(value * 10) / 10;

/** Classe de la carte des pixels où tombe une classe du modèle (maïs, soja : annuelles). */
function mapClassOfGroup(group: string): CultivatedClass {
  const crops = CROP_GROUPS.find((entry) => entry.key === group)?.crops ?? [];
  return cropMapClassOf(crops[0] ?? group);
}

/** Vue du ministère sur les cultures mesurées ; null hors portée nationale ou sans modèle. */
export async function getParcelCropOverview(actor: Actor): Promise<ParcelCropOverview | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;
  const model = await prisma.cropModel.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: "desc" },
    select: {
      version: true,
      trainedAt: true,
      trainingParcels: true,
      metrics: true,
      sourceId: true,
    },
  });
  if (!model) return null;
  const [agreementRows, disagreementRows, areaRows, mapRows] = await Promise.all([
    predictionAgreementCounts(campaign.id),
    listPredictionDisagreements(campaign.id, DISAGREEMENTS_SHOWN),
    measuredCropAreas(campaign.id),
    cropAreaEstimates(campaign.id),
  ]);
  const metrics = metricsSchema.safeParse(model.metrics);
  const cv = metrics.success ? (metrics.data.crossValidation ?? null) : null;

  let accuracy: ParcelCropOverview["accuracy"] = null;
  if (cv) {
    const names = new Map(
      (
        await prisma.commune.findMany({
          where: { code: { in: cv.communes.map((commune) => commune.code) } },
          select: { code: true, name: true },
        })
      ).map((commune) => [commune.code, commune.name]),
    );
    const confusion = groupConfusion(cv.pairs);
    accuracy = {
      ...confusion,
      folds: cv.folds,
      confident: {
        judged: cv.confident.judged,
        share: confusion.judged > 0 ? cv.confident.judged / confusion.judged : null,
        accuracy: rateOf(cv.confident.correct, cv.confident.judged),
      },
      communes: cv.communes.map((commune) => ({
        code: commune.code,
        name: names.get(commune.code) ?? commune.code,
        judged: commune.judged,
        accuracy: rateOf(commune.correct, commune.judged),
      })),
    };
  }

  const byCrop = new Map<string, { agrees: number; differs: number; uncertain: number }>();
  const totals = { agrees: 0, differs: 0, uncertain: 0 };
  for (const row of agreementRows) {
    const key =
      row.agreement === "AGREES" ? "agrees" : row.agreement === "DIFFERS" ? "differs" : "uncertain";
    totals[key] += row.parcels;
    if (!row.declared_group) continue;
    const entry = byCrop.get(row.declared_group) ?? { agrees: 0, differs: 0, uncertain: 0 };
    entry[key] += row.parcels;
    byCrop.set(row.declared_group, entry);
  }

  const areasByCrop = new Map<
    string,
    { classifiedParcels: number; classifiedHa: number; weightedHa: number; declaredHa: number }
  >();
  const measuredByClass = new Map<
    string,
    { communeCode: string; communeName: string; cropClass: CultivatedClass; measuredHa: number }
  >();
  const measuredCommunes = new Set<string>();
  for (const row of areaRows) {
    const crop = areasByCrop.get(row.crop_group) ?? {
      classifiedParcels: 0,
      classifiedHa: 0,
      weightedHa: 0,
      declaredHa: 0,
    };
    crop.classifiedParcels += row.classified_parcels;
    crop.classifiedHa += row.classified_ha;
    crop.weightedHa += row.weighted_ha;
    crop.declaredHa += row.declared_ha;
    areasByCrop.set(row.crop_group, crop);
    measuredCommunes.add(row.commune_id);
    const cropClass = mapClassOfGroup(row.crop_group);
    const key = `${row.commune_id}:${cropClass}`;
    const entry = measuredByClass.get(key) ?? {
      communeCode: row.commune_code,
      communeName: row.commune_name,
      cropClass,
      measuredHa: 0,
    };
    entry.measuredHa += row.weighted_ha;
    measuredByClass.set(key, entry);
  }
  const pixelHa = new Map<string, number>();
  for (const row of mapRows) {
    if (!measuredCommunes.has(row.commune_id)) continue;
    const key = `${row.commune_id}:${row.crop_class}`;
    pixelHa.set(key, (pixelHa.get(key) ?? 0) + row.area_ha);
  }

  const groupRank = (group: string) => CROP_GROUPS.findIndex((entry) => entry.key === group);
  return {
    campaignCode: campaign.code,
    model: {
      version: model.version,
      trainedAt: model.trainedAt,
      trainingParcels: model.trainingParcels,
      fieldVisitLabels: metrics.success ? (metrics.data.fieldVisitLabels ?? 0) : 0,
      synthetic: model.sourceId === "BAIS_SEED",
    },
    accuracy,
    agreement: {
      parcels: totals.agrees + totals.differs + totals.uncertain,
      ...totals,
      byCrop: [...byCrop.entries()]
        .map(([group, entry]) => {
          const parcels = entry.agrees + entry.differs + entry.uncertain;
          return { group, parcels, ...entry, agreementRate: rateOf(entry.agrees, parcels) };
        })
        .sort((a, b) => groupRank(a.group) - groupRank(b.group)),
    },
    disagreements: disagreementRows.map((row) => ({
      parcelId: row.parcel_id,
      parcelCode: row.parcel_code,
      communeName: row.commune_name,
      measuredGroup: row.crop_group,
      declaredGroup: row.declared_group,
      confidence: row.confidence,
    })),
    areas: {
      byCrop: [...areasByCrop.entries()]
        .map(([group, entry]) => ({
          group,
          classifiedParcels: entry.classifiedParcels,
          classifiedHa: hectares(entry.classifiedHa),
          weightedHa: hectares(entry.weightedHa),
          declaredHa: hectares(entry.declaredHa),
        }))
        .sort((a, b) => groupRank(a.group) - groupRank(b.group)),
      byCommune: [...measuredByClass.entries()]
        .map(([key, entry]) => {
          const seen = pixelHa.get(key) ?? null;
          return {
            ...entry,
            measuredHa: hectares(entry.measuredHa),
            mapHa: seen === null ? null : hectares(seen),
            share: seen !== null && seen >= MIN_MAP_HA_FOR_SHARE ? entry.measuredHa / seen : null,
          };
        })
        .sort(
          (a, b) =>
            a.communeName.localeCompare(b.communeName) || a.cropClass.localeCompare(b.cropClass),
        ),
    },
  };
}
