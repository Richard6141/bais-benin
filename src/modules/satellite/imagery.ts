import {
  addProcessingUnits,
  findCachedImage,
  holdAfterFailure,
  readCountryOutline3857,
  reserveProcessingRequest,
  storeCachedImage,
  type ProcessingBudget,
  type SatelliteLayerCode,
} from "@/database/sql/satellite.sql";
import { getServerEnv } from "@/lib/env";
import { bboxToEnvelope3857, tileToEnvelope3857 } from "@/lib/geo/tile-math";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  RemoteSensingProviderError,
  type ClipGeometry,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import {
  BENIN_IMAGERY_BBOX,
  CROP_MAP_PERIOD,
  ROLLING_PERIOD,
  isCurrentPeriod,
  isOfferedFor,
  periodOf,
  periodRange,
} from "./periods";
import { DETAIL_TILE_SIZE, isDetailTileInBenin, overviewSize, rectTouchesOutline } from "./tiles";

// Images de la vue du ciel : une image d'ensemble du pays par couche et par mois, puis des
// tuiles de 512 px aux zooms rapprochés. Tout passe par le cache en base avant Copernicus, et
// chaque appel réserve d'abord sa place dans le plafond mensuel (quota gratuit CDSE).

/** Scènes plus nuageuses écartées ; les moins nuageuses passent devant (leastCC). */
const MAX_CLOUD_COVER = 80;
/** Le mois en cours reçoit de nouveaux passages : ses images sont redemandées après ce délai. */
const CURRENT_PERIOD_TTL_MS = 2 * 86_400_000;
/** Après un échec de Copernicus, pas de nouvel essai (ni de réservation) avant ce délai. */
const FAILURE_HOLD_MS = 3_600_000;

export type ImageryOutcome =
  | { status: "ok"; image: Uint8Array; permanent: boolean }
  | { status: "empty" }
  | { status: "period-not-offered" }
  | { status: "not-configured" }
  | { status: "budget-exhausted" }
  | { status: "throttled" }
  | { status: "account-limit" }
  | { status: "unavailable" };

// Version des images en cache : v2 découpe sur la frontière du pays (les images v1, sur le
// rectangle entier, restent en base mais ne sont plus servies). v3 : la fenêtre glissante devient
// une mosaïque sans nuages ; les mois gardent leurs images v2.
const CACHE_VERSION = "v2";
const ROLLING_CACHE_VERSION = "v3";

// Frontière du pays, lue une fois par processus (union des communes simplifiée).
let outline: Promise<ClipGeometry | null> | null = null;
function countryOutline(): Promise<ClipGeometry | null> {
  outline ??= readCountryOutline3857()
    .then((geometry) => geometry as ClipGeometry | null)
    .catch((error: unknown) => {
      outline = null;
      throw error;
    });
  return outline;
}

/** Garde-fous du compte CDSE, lus dans la configuration (revue de sécurité R2). */
export function processingBudget(): ProcessingBudget {
  const env = getServerEnv();
  return {
    total: env.SATELLITE_MONTHLY_REQUEST_BUDGET,
    proposalShare: env.SATELLITE_PROPOSAL_SHARE,
    statisticsShare: env.SATELLITE_STATISTICS_SHARE,
    processingUnits: env.SATELLITE_MONTHLY_UNIT_BUDGET,
    perMinute: env.SATELLITE_REQUESTS_PER_MINUTE,
  };
}

// Deux demandes simultanées de la même tuile (plusieurs visiteurs) : un seul appel Copernicus.
const inflight = new Map<string, Promise<ImageryOutcome>>();

interface RenderTarget {
  layer: SatelliteLayerCode;
  period: string;
  tileKey: string;
  envelope: readonly [number, number, number, number];
  width: number;
  height: number;
}

async function renderCached(
  target: RenderTarget,
  provider: RemoteSensingProvider,
  now: Date,
  requesterId: string | undefined,
): Promise<ImageryOutcome> {
  const cloudFree = target.period === ROLLING_PERIOD;
  const tileKey = `${cloudFree ? ROLLING_CACHE_VERSION : CACHE_VERSION}:${target.tileKey}`;
  const cached = await findCachedImage(target.layer, target.period, tileKey);
  const fresh = cached && (cached.expiresAt === null || cached.expiresAt.getTime() > now.getTime());
  const fromCache = (entry: NonNullable<typeof cached>): ImageryOutcome =>
    entry.image
      ? { status: "ok", image: entry.image, permanent: entry.expiresAt === null }
      : { status: "empty" };
  if (cached && fresh) return fromCache(cached);
  if (!provider.canProcess) return cached ? fromCache(cached) : { status: "not-configured" };

  const month = periodOf(now);
  // Plafond par compte sur les seules tuiles à calculer : revoir une zone déjà en cache ne coûte
  // rien au quota et n'est donc pas compté (revue R2).
  if (requesterId) {
    const allowed = await consumeRateLimit(`satellite-miss:${requesterId}:${month}`, {
      windowSeconds: 40 * 86_400,
      max: getServerEnv().SATELLITE_TILE_MISSES_PER_ACCOUNT,
    });
    if (!allowed) return cached ? fromCache(cached) : { status: "account-limit" };
  }
  const reservation = await reserveProcessingRequest(month, "IMAGE", processingBudget(), now);
  if (reservation !== "reserved") {
    // Refus : une image périmée vaut mieux que rien.
    if (cached) return fromCache(cached);
    return { status: reservation === "throttled" ? "throttled" : "budget-exhausted" };
  }
  const { from, to } = periodRange(target.period, now);
  try {
    const clip = (await countryOutline()) ?? undefined;
    const result = await provider.renderImage({
      layer: target.layer,
      envelope: target.envelope,
      clip,
      width: target.width,
      height: target.height,
      from,
      to,
      maxCloudCover: MAX_CLOUD_COVER,
      cloudFree,
    });
    if (result?.processingUnits) await addProcessingUnits(month, result.processingUnits);
    const permanent = !isCurrentPeriod(target.period, now);
    const expiresAt = permanent ? null : new Date(now.getTime() + CURRENT_PERIOD_TTL_MS);
    await storeCachedImage(target.layer, target.period, tileKey, result?.image ?? null, expiresAt);
    return result ? { status: "ok", image: result.image, permanent } : { status: "empty" };
  } catch (error) {
    if (!(error instanceof RemoteSensingProviderError)) throw error;
    logger.warn(
      { err: error, layer: target.layer, period: target.period, tile: target.tileKey },
      "Image satellite indisponible",
    );
    // Échec gardé une heure : sans cela, chaque nouvel essai réserverait une unité de plus.
    await holdAfterFailure(
      target.layer,
      target.period,
      tileKey,
      new Date(now.getTime() + FAILURE_HOLD_MS),
    );
    return cached ? fromCache(cached) : { status: "unavailable" };
  }
}

function render(target: RenderTarget, now: Date, requesterId?: string): Promise<ImageryOutcome> {
  // Hors des mois proposés : refus avant le cache, le quota et Copernicus. La carte des cultures
  // n'est jamais calculée à la demande (renderCropMap).
  if (target.layer === "CROP_CLASSES" || !isOfferedFor(target.layer, target.period, now))
    return Promise.resolve({ status: "period-not-offered" });
  const key = `${target.layer}/${target.period}/${target.tileKey}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = renderCached(target, getRemoteSensingProvider(), now, requesterId).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Image d'ensemble du pays pour une couche et un mois. */
export function getOverviewImage(
  layer: SatelliteLayerCode,
  period: string,
  now = new Date(),
): Promise<ImageryOutcome> {
  const { width, height } = overviewSize();
  return render(
    {
      layer,
      period,
      tileKey: "overview",
      envelope: bboxToEnvelope3857(BENIN_IMAGERY_BBOX),
      width,
      height,
    },
    now,
  );
}

/**
 * Tuile détaillée de 512 px (schéma XYZ), aux zooms admis et qui touche le pays : une tuile hors
 * du contour du Bénin ne réserve rien (revue R2). `requesterId` : compte à qui s'applique le
 * plafond mensuel de tuiles nouvelles.
 */
export async function getDetailTile(
  layer: SatelliteLayerCode,
  period: string,
  z: number,
  x: number,
  y: number,
  options: { now?: Date; requesterId?: string } = {},
): Promise<ImageryOutcome> {
  const now = options.now ?? new Date();
  // Carte des cultures : image d'ensemble seulement, des tuiles dépasseraient la part des images.
  if (layer === "CROP_CLASSES" || !isOfferedFor(layer, period, now)) {
    return { status: "period-not-offered" };
  }
  if (!isDetailTileInBenin(z, x, y)) return { status: "empty" };
  const envelope = tileToEnvelope3857(z, x, y);
  const border = await countryOutline();
  if (border && !rectTouchesOutline(envelope, border)) return { status: "empty" };
  return render(
    {
      layer,
      period,
      tileKey: `${z}/${x}/${y}`,
      envelope,
      width: DETAIL_TILE_SIZE,
      height: DETAIL_TILE_SIZE,
    },
    now,
    options.requesterId,
  );
}

// --- Carte des cultures (ADR-0021) ------------------------------------------------------------
// Douze mois de série par pixel sur tout le pays : trop long pour la requête d'un visiteur (la
// requête de 30 s expirait). L'image est calculée par une commande planifiée, en quatre quarts du
// pays, chacun avec un long délai ; la route publique ne sert que ces images en cache.

export const CROP_MAP_QUARTERS = 4;
/** Clé des quarts en cache ; à changer avec la règle de classification. */
const CROP_MAP_CACHE_KEY = "crop-m3";
/** Délai d'un quart : une série de douze mois et deux traces à lire chez Copernicus. */
const CROP_MAP_QUARTER_TIMEOUT_MS = 200_000;
/** Temps de calcul d'un appel, sous la limite de 300 s de la route ; l'appel suivant reprend. */
const CROP_MAP_RUN_BUDGET_MS = 250_000;

function cropMapTileKey(index: number): string {
  return `${CROP_MAP_CACHE_KEY}:q${index}`;
}

/**
 * Emprise d'un quart en EPSG:3857 : 0 au nord-ouest, 1 au nord-est, 2 au sud-ouest, 3 au
 * sud-est, coupés au milieu du rectangle en mètres (les coins de la carte en dépendent).
 */
export function cropMapQuarterEnvelope(index: number): readonly [number, number, number, number] {
  const [xmin, ymin, xmax, ymax] = bboxToEnvelope3857(BENIN_IMAGERY_BBOX);
  const xmid = (xmin + xmax) / 2;
  const ymid = (ymin + ymax) / 2;
  const east = index % 2 === 1;
  const south = index >= 2;
  return [east ? xmid : xmin, south ? ymin : ymid, east ? xmax : xmid, south ? ymid : ymax];
}

/** Quart de la carte des cultures, depuis le cache seulement : jamais de calcul à la demande. */
export async function getCropMapQuarter(index: number): Promise<ImageryOutcome> {
  if (!Number.isInteger(index) || index < 0 || index >= CROP_MAP_QUARTERS) {
    return { status: "period-not-offered" };
  }
  const cached = await findCachedImage("CROP_CLASSES", CROP_MAP_PERIOD, cropMapTileKey(index));
  return cached?.image
    ? { status: "ok", image: cached.image, permanent: false }
    : { status: "empty" };
}

export interface CropMapRenderResult {
  quarters: {
    index: number;
    status: "rendered" | "cached" | "empty" | "failed" | "budget-exhausted" | "throttled";
    processingUnits: number | null;
  }[];
  processingUnits: number;
  /** Quarts restant à calculer : l'appel suivant les reprend. */
  remaining: number;
}

/** Début du mois suivant (UTC) : la carte est refaite une fois par mois. */
function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Calcule les quarts manquants ou périmés de la carte des cultures (commande planifiée). Chaque
 * quart réserve sa place dans la part des images ; `force` refait aussi les quarts à jour.
 */
export async function renderCropMap(
  options: { now?: Date; force?: boolean } = {},
): Promise<CropMapRenderResult | null> {
  const provider = getRemoteSensingProvider();
  if (!provider.canProcess) return null;
  const now = options.now ?? new Date();
  const started = Date.now();
  const { width, height } = overviewSize();
  const { from, to } = periodRange(CROP_MAP_PERIOD, now);
  const month = periodOf(now);
  const clip = (await countryOutline()) ?? undefined;
  const result: CropMapRenderResult = { quarters: [], processingUnits: 0, remaining: 0 };

  for (let index = 0; index < CROP_MAP_QUARTERS; index += 1) {
    const tileKey = cropMapTileKey(index);
    const cached = await findCachedImage("CROP_CLASSES", CROP_MAP_PERIOD, tileKey);
    const fresh = cached?.image && cached.expiresAt && cached.expiresAt.getTime() > now.getTime();
    if (fresh && !options.force) {
      result.quarters.push({ index, status: "cached", processingUnits: null });
      continue;
    }
    const left = CROP_MAP_RUN_BUDGET_MS - (Date.now() - started);
    if (left < 60_000) {
      result.remaining += 1;
      continue;
    }
    const reservation = await reserveProcessingRequest(month, "IMAGE", processingBudget(), now);
    if (reservation !== "reserved") {
      result.quarters.push({
        index,
        status: reservation === "throttled" ? "throttled" : "budget-exhausted",
        processingUnits: null,
      });
      result.remaining += 1;
      continue;
    }
    try {
      const rendered = await provider.renderImage({
        layer: "CROP_CLASSES",
        envelope: cropMapQuarterEnvelope(index),
        clip,
        width: Math.round(width / 2),
        height: Math.round(height / 2),
        from,
        to,
        maxCloudCover: MAX_CLOUD_COVER,
        timeoutMs: Math.min(CROP_MAP_QUARTER_TIMEOUT_MS, left),
      });
      if (rendered?.processingUnits) await addProcessingUnits(month, rendered.processingUnits);
      // Une réponse vide ne remplace pas une carte déjà servie.
      if (rendered) {
        await storeCachedImage(
          "CROP_CLASSES",
          CROP_MAP_PERIOD,
          tileKey,
          rendered.image,
          nextMonthStart(now),
        );
      }
      result.quarters.push({
        index,
        status: rendered ? "rendered" : "empty",
        processingUnits: rendered?.processingUnits ?? null,
      });
      result.processingUnits += rendered?.processingUnits ?? 0;
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      logger.warn({ err: error, quarter: index }, "Carte des cultures indisponible");
      result.quarters.push({ index, status: "failed", processingUnits: null });
      result.remaining += 1;
    }
  }
  return result;
}
