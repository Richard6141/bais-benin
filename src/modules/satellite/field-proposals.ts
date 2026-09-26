import { prisma } from "@/database/client";
import {
  addProcessingUnits,
  geodesicAreasHa,
  reserveProcessingRequest,
} from "@/database/sql/satellite.sql";
import { lonLatTo3857, mercatorToLonLat } from "@/lib/geo/tile-math";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { authorize, type Actor } from "@/modules/authorization";
import {
  RemoteSensingNotConfiguredError,
  RemoteSensingProviderError,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { segmentField, type CandidateLevel } from "./field-segmentation";
import { processingBudget } from "./imagery";
import { BENIN_IMAGERY_BBOX, periodOf } from "./periods";

// Délimitation assistée des champs (ADR-0016, phase 3) : autour du point désigné par l'agent,
// Copernicus calcule les variables d'une fenêtre de 640 m (une requête), le serveur segmente et
// propose jusqu'à trois contours, avec leur surface PostGIS et un indice de confiance. L'agent
// choisit, corrige et enregistre par la commande hors ligne habituelle (parcel.geometry.set).

/** Fenêtre de 64 × 64 pixels de 10 m, centrée sur le point. */
const WINDOW_PIXELS = 64;
const PIXEL_M = 10;
/** Dix mois de passages : un pic de saison des pluies et un creux de saison sèche. */
const LOOKBACK_DAYS = 300;
/** Le point doit rester près de la parcelle : pas de balayage du territoire par ce service. */
const MAX_DISTANCE_M = 2000;
/** Propositions par agent et par jour. */
export const PROPOSALS_PER_DAY = 30;
const CACHE_TTL_MS = 12 * 3_600_000;
const CACHE_MAX = 300;

export interface ProposedContour {
  level: CandidateLevel;
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
  areaHa: number;
  confidence: number;
  touchesEdge: boolean;
}

export type FieldProposalOutcome =
  | {
      status: "ok";
      point: { lon: number; lat: number };
      candidates: ProposedContour[];
      window: { from: string; to: string };
      sourceId: string;
      attribution: string;
    }
  | { status: "not-found" }
  | { status: "point-too-far" }
  | { status: "rate-limited" }
  | { status: "share-exhausted" }
  | { status: "throttled" }
  | { status: "not-configured" }
  | { status: "unavailable" }
  | { status: "clouded" }
  | { status: "too-small" }
  | { status: "no-field" };

type OkOutcome = Extract<FieldProposalOutcome, { status: "ok" }>;
const cache = new Map<string, { expiresAt: number; value: OkOutcome }>();

function metersBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

async function parcelContext(parcelId: string) {
  const parcel = await prisma.parcel.findFirst({
    where: { id: parcelId, archivedAt: null, farm: { archivedAt: null } },
    select: {
      id: true,
      farm: {
        select: {
          id: true,
          communeId: true,
          registeredById: true,
          farmer: { select: { userId: true } },
        },
      },
    },
  });
  if (!parcel) return null;
  const points = await prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>`
    SELECT ST_X(coalesce(p."centroid", f."location")::geometry) AS lng,
           ST_Y(coalesce(p."centroid", f."location")::geometry) AS lat
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
     WHERE p."id" = ${parcelId}::uuid`;
  const reference =
    points[0]?.lng !== null && points[0]?.lng !== undefined && points[0]?.lat !== null
      ? { lon: points[0].lng, lat: points[0].lat as number }
      : null;
  return { parcel, reference };
}

/**
 * Propose des contours de champ autour d'un point, pour une parcelle que l'acteur peut modifier.
 * Sans point, le centre de la parcelle (ou le siège de l'exploitation) sert de point de départ.
 */
export async function proposeFieldContours(
  actor: Actor,
  request: { parcelId: string; lon?: number; lat?: number },
  provider: RemoteSensingProvider,
  now = new Date(),
): Promise<FieldProposalOutcome> {
  const context = await parcelContext(request.parcelId);
  if (!context) return { status: "not-found" };
  const { farm } = context.parcel;
  const decision = authorize(actor, "farm.update", {
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    communeId: farm.communeId,
  });
  if (!decision.allowed) return { status: "not-found" };

  const point =
    request.lon !== undefined && request.lat !== undefined
      ? { lon: request.lon, lat: request.lat }
      : context.reference;
  if (!point) return { status: "point-too-far" };
  const [minLon, minLat, maxLon, maxLat] = BENIN_IMAGERY_BBOX;
  const inBenin =
    point.lon >= minLon && point.lon <= maxLon && point.lat >= minLat && point.lat <= maxLat;
  if (!inBenin || (context.reference && metersBetween(point, context.reference) > MAX_DISTANCE_M)) {
    return { status: "point-too-far" };
  }

  // Même point (à 11 m près) dans la même journée : la proposition déjà calculée resservie.
  const cacheKey = `${point.lon.toFixed(4)}:${point.lat.toFixed(4)}:${now.toISOString().slice(0, 10)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;

  if (!provider.canProcess) return { status: "not-configured" };
  if (
    !(await consumeRateLimit(`satellite-proposal:${actor.userId}`, {
      windowSeconds: 86_400,
      max: PROPOSALS_PER_DAY,
    }))
  ) {
    return { status: "rate-limited" };
  }
  const month = periodOf(now);
  if (provider.id === "cdse") {
    const reservation = await reserveProcessingRequest(month, "PROPOSAL", processingBudget(), now);
    if (reservation === "throttled") return { status: "throttled" };
    if (reservation !== "reserved") return { status: "share-exhausted" };
  }

  // Emprise de 64 pixels de 10 m au sol : en Web Mercator, un mètre au sol vaut 1/cos(lat).
  const [cx, cy] = lonLatTo3857(point.lon, point.lat);
  const pixel = PIXEL_M / Math.cos((point.lat * Math.PI) / 180);
  const half = (WINDOW_PIXELS / 2) * pixel;
  const envelope = [cx - half, cy - half, cx + half, cy + half] as const;
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const to = now.toISOString();

  let features;
  try {
    features = await provider.fieldFeatures({
      envelope,
      width: WINDOW_PIXELS,
      height: WINDOW_PIXELS,
      from,
      to,
    });
  } catch (error) {
    if (error instanceof RemoteSensingNotConfiguredError) return { status: "not-configured" };
    if (!(error instanceof RemoteSensingProviderError)) throw error;
    logger.warn({ err: error }, "Variables de champ indisponibles");
    return { status: "unavailable" };
  }
  if (features.processingUnits) await addProcessingUnits(month, features.processingUnits);

  const result = segmentField(
    features,
    { col: WINDOW_PIXELS / 2, row: WINDOW_PIXELS / 2 },
    PIXEL_M * PIXEL_M,
  );
  if (!result.ok) {
    return {
      status:
        result.reason === "SEED_INVALID"
          ? "clouded"
          : result.reason === "TOO_SMALL"
            ? "too-small"
            : "no-field",
    };
  }

  const geometries = result.candidates.map((candidate) => ({
    type: "Polygon" as const,
    coordinates: [
      candidate.ring.map(([x, y]) => {
        const [lon, lat] = mercatorToLonLat(envelope[0] + x * pixel, envelope[3] - y * pixel);
        return [Number(lon.toFixed(7)), Number(lat.toFixed(7))] as [number, number];
      }),
    ],
  }));
  const areas = await geodesicAreasHa(geometries.map((geometry) => JSON.stringify(geometry)));
  const value: OkOutcome = {
    status: "ok",
    point,
    candidates: result.candidates.map((candidate, index) => ({
      level: candidate.level,
      geometry: geometries[index] as ProposedContour["geometry"],
      areaHa: Math.round((areas[index] ?? 0) * 100) / 100,
      confidence: candidate.confidence,
      touchesEdge: candidate.touchesEdge,
    })),
    window: { from, to },
    sourceId: provider.provenance.sourceId,
    attribution: provider.provenance.attribution,
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { expiresAt: now.getTime() + CACHE_TTL_MS, value });
  return value;
}
