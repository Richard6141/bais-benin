import { prisma } from "@/database/client";
import {
  readParcelShape,
  readParcelYields,
  type ParcelYieldRow,
} from "@/database/sql/parcel-inspection.sql";
import { recordAudit } from "@/modules/audit";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";
import { farmParcelOverlaps, type ParcelOverlapFlag } from "./parcel-overlaps";

// Fiche d'une parcelle ouverte depuis la carte : qui la cultive, quoi, avec quel rendement, ce
// que le satellite en voit et ce qui y a été signalé. Même règle d'accès que la fiche de
// l'exploitation (farm.read) : tout le pays pour le ministère, ses propres enregistrements pour
// l'agent (ADR-0014), ses parcelles pour le producteur. Hors portée, la parcelle « n'existe pas ».
// Le téléphone du producteur n'est donné qu'avec le droit farmer.contact.read. Une ouverture par
// un compte à portée nationale est journalisée : c'est une lecture nominative.

/** Sous ce nombre de parcelles comparables, la médiane de la commune n'est pas affichée. */
export const MIN_YIELD_PEERS = 5;

export interface ParcelInspectionCrop {
  cropCode: string;
  cropName: string;
  colorHex: string | null;
  campaignCode: string;
  campaignOpen: boolean;
  subSeason: string;
  areaHa: number;
  stage: string;
  sowingDate: Date | null;
  harvestKg: number | null;
  yieldTPerHa: number | null;
  /** Médiane des parcelles de la commune (même culture, même campagne), si assez de pairs. */
  communeMedianTPerHa: number | null;
  peers: number;
  /** Part des pairs de la commune au rendement inférieur (0 à 1), si assez de pairs. */
  betterThanShare: number | null;
}

export interface ParcelInspectionVegetation {
  status: "CONSISTENT" | "TO_VERIFY" | "INSUFFICIENT_DATA" | "PENDING";
  reason: string | null;
  cropName: string;
  campaignCode: string;
  peakNdvi: number | null;
  expectedNdvi: number;
  sensor: string;
  sourceId: string;
  computedAt: Date;
  series: Array<{ from: string; to: string; ndvi: number | null }>;
}

export interface ParcelInspection {
  id: string;
  code: string;
  declaredAreaHa: number;
  computedAreaHa: number | null;
  captureMethod: string;
  irrigation: string;
  centroid: { lng: number; lat: number } | null;
  bbox: [number, number, number, number] | null;
  farm: {
    id: string;
    code: string;
    name: string | null;
    village: string | null;
    communeName: string;
    departementName: string;
    verificationStatus: "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED" | "DISPUTED";
    parcelCount: number;
  };
  farmer: { code: string; displayName: string; phone: string | null };
  crops: ParcelInspectionCrop[];
  vegetation: ParcelInspectionVegetation | null;
  overlaps: ParcelOverlapFlag[];
  reports: Array<{
    id: string;
    type: string;
    status: string;
    cropCode: string | null;
    observedAt: Date;
  }>;
}

const REPORT_LIMIT = 5;

function toSeries(value: unknown): ParcelInspectionVegetation["series"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { from, to, ndvi } = item as Record<string, unknown>;
    if (typeof from !== "string" || typeof to !== "string") return [];
    return [{ from, to, ndvi: typeof ndvi === "number" && Number.isFinite(ndvi) ? ndvi : null }];
  });
}

function comparison(row: ParcelYieldRow | undefined) {
  if (!row) return { communeMedianTPerHa: null, peers: 0, betterThanShare: null };
  const enough = row.peers >= MIN_YIELD_PEERS;
  return {
    communeMedianTPerHa: enough ? row.peer_median_t_per_ha : null,
    peers: row.peers,
    betterThanShare: enough ? row.better_than_share : null,
  };
}

export async function getParcelInspection(
  actor: Actor,
  parcelId: string,
): Promise<ParcelInspection | null> {
  const row = await prisma.parcel.findFirst({
    where: { id: parcelId, archivedAt: null, farm: { archivedAt: null } },
    select: {
      id: true,
      code: true,
      declaredAreaHa: true,
      computedAreaHa: true,
      captureMethod: true,
      irrigation: true,
      farm: {
        select: {
          id: true,
          code: true,
          name: true,
          village: true,
          communeId: true,
          registeredById: true,
          verificationStatus: true,
          commune: {
            select: { name: true, departementId: true, departement: { select: { name: true } } },
          },
          farmer: {
            select: { code: true, firstName: true, lastName: true, phoneE164: true, userId: true },
          },
          _count: { select: { parcels: { where: { archivedAt: null } } } },
        },
      },
      crops: {
        where: { archivedAt: null },
        orderBy: [{ campaign: { startYear: "desc" } }, { areaHa: "desc" }],
        select: {
          id: true,
          areaHa: true,
          subSeason: true,
          stage: true,
          sowingDate: true,
          crop: { select: { code: true, nameFr: true, colorHex: true } },
          campaign: { select: { code: true, status: true } },
        },
      },
      vegetationChecks: {
        orderBy: { computedAt: "desc" },
        take: 1,
        select: {
          status: true,
          reason: true,
          peakNdvi: true,
          expectedNdvi: true,
          sensor: true,
          sourceId: true,
          computedAt: true,
          series: true,
          crop: { select: { nameFr: true } },
          campaign: { select: { code: true } },
        },
      },
      fieldReports: {
        orderBy: { observedAt: "desc" },
        take: REPORT_LIMIT,
        select: { id: true, type: true, status: true, cropCode: true, observedAt: true },
      },
    },
  });
  if (!row) return null;
  const { farm } = row;
  const resource = {
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    communeId: farm.communeId,
    departementId: farm.commune.departementId,
  };
  if (!authorize(actor, "farm.read", resource).allowed) return null;
  const canContact = authorize(actor, "farmer.contact.read", resource).allowed;

  const [shape, yields, overlaps] = await Promise.all([
    readParcelShape(row.id),
    readParcelYields(row.id),
    farmParcelOverlaps(actor, farm.id),
  ]);
  const yieldById = new Map(yields.map((y) => [y.parcel_crop_id, y]));
  const check = row.vegetationChecks[0];

  if (scopeFilter(actor, "farm.read").kind === "all") {
    await recordAudit({
      action: "registry.parcel.inspected",
      actorId: actor.userId,
      resourceType: "parcel",
      resourceId: row.id,
    });
  }

  return {
    id: row.id,
    code: row.code,
    declaredAreaHa: Number(row.declaredAreaHa),
    computedAreaHa: row.computedAreaHa === null ? null : Number(row.computedAreaHa),
    captureMethod: row.captureMethod,
    irrigation: row.irrigation,
    centroid: shape.centroid,
    bbox: shape.bbox,
    farm: {
      id: farm.id,
      code: farm.code,
      name: farm.name,
      village: farm.village,
      communeName: farm.commune.name,
      departementName: farm.commune.departement.name,
      verificationStatus: farm.verificationStatus,
      parcelCount: farm._count.parcels,
    },
    farmer: {
      code: farm.farmer.code,
      displayName: `${farm.farmer.firstName} ${farm.farmer.lastName}`,
      phone: canContact ? farm.farmer.phoneE164 : null,
    },
    crops: row.crops.map((crop) => {
      const measured = yieldById.get(crop.id);
      return {
        cropCode: crop.crop.code,
        cropName: crop.crop.nameFr,
        colorHex: crop.crop.colorHex,
        campaignCode: crop.campaign.code,
        campaignOpen: crop.campaign.status === "OPEN",
        subSeason: crop.subSeason,
        areaHa: Number(crop.areaHa),
        stage: crop.stage,
        sowingDate: crop.sowingDate,
        harvestKg: measured?.harvest_kg ?? null,
        yieldTPerHa: measured?.yield_t_per_ha ?? null,
        ...comparison(measured),
      };
    }),
    vegetation: check
      ? {
          status: check.status,
          reason: check.reason,
          cropName: check.crop.nameFr,
          campaignCode: check.campaign.code,
          peakNdvi: check.peakNdvi === null ? null : Number(check.peakNdvi),
          expectedNdvi: Number(check.expectedNdvi),
          sensor: check.sensor,
          sourceId: check.sourceId,
          computedAt: check.computedAt,
          series: toSeries(check.series),
        }
      : null,
    overlaps: overlaps.get(row.id) ?? [],
    reports: row.fieldReports,
  };
}
