import {
  addProcessingUnits,
  findCachedImage,
  reserveProcessingRequest,
  storeCachedImage,
  type SatelliteLayerCode,
} from "@/database/sql/satellite.sql";
import { getServerEnv } from "@/lib/env";
import { bboxToEnvelope3857, tileToEnvelope3857 } from "@/lib/geo/tile-math";
import { logger } from "@/lib/logger";
import {
  RemoteSensingProviderError,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { BENIN_IMAGERY_BBOX, isCurrentPeriod, periodOf, periodRange } from "./periods";
import { DETAIL_TILE_SIZE, isDetailTileInBenin, overviewSize } from "./tiles";

// Images de la vue du ciel : une image d'ensemble du pays par couche et par mois, puis des
// tuiles de 512 px aux zooms rapprochés. Tout passe par le cache en base avant Copernicus, et
// chaque appel réserve d'abord sa place dans le plafond mensuel (quota gratuit CDSE).

/** Scènes plus nuageuses écartées ; les moins nuageuses passent devant (leastCC). */
const MAX_CLOUD_COVER = 80;
/** Le mois en cours reçoit de nouveaux passages : ses images sont redemandées après ce délai. */
const CURRENT_PERIOD_TTL_MS = 2 * 86_400_000;

export type ImageryOutcome =
  | { status: "ok"; image: Uint8Array; permanent: boolean }
  | { status: "empty" }
  | { status: "not-configured" }
  | { status: "budget-exhausted" }
  | { status: "unavailable" };

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
): Promise<ImageryOutcome> {
  const cached = await findCachedImage(target.layer, target.period, target.tileKey);
  const fresh = cached && (cached.expiresAt === null || cached.expiresAt.getTime() > now.getTime());
  const fromCache = (entry: NonNullable<typeof cached>): ImageryOutcome =>
    entry.image
      ? { status: "ok", image: entry.image, permanent: entry.expiresAt === null }
      : { status: "empty" };
  if (cached && fresh) return fromCache(cached);
  if (!provider.canProcess) return cached ? fromCache(cached) : { status: "not-configured" };

  const month = periodOf(now);
  const budget = getServerEnv().SATELLITE_MONTHLY_REQUEST_BUDGET;
  if (!(await reserveProcessingRequest(month, "IMAGE", budget))) {
    // Plafond atteint : une image périmée vaut mieux que rien.
    return cached ? fromCache(cached) : { status: "budget-exhausted" };
  }
  const { from, to } = periodRange(target.period, now);
  try {
    const result = await provider.renderImage({
      layer: target.layer,
      envelope: target.envelope,
      width: target.width,
      height: target.height,
      from,
      to,
      maxCloudCover: MAX_CLOUD_COVER,
    });
    if (result?.processingUnits) await addProcessingUnits(month, result.processingUnits);
    const permanent = !isCurrentPeriod(target.period, now);
    const expiresAt = permanent ? null : new Date(now.getTime() + CURRENT_PERIOD_TTL_MS);
    await storeCachedImage(
      target.layer,
      target.period,
      target.tileKey,
      result?.image ?? null,
      expiresAt,
    );
    return result ? { status: "ok", image: result.image, permanent } : { status: "empty" };
  } catch (error) {
    if (!(error instanceof RemoteSensingProviderError)) throw error;
    logger.warn(
      { err: error, layer: target.layer, period: target.period, tile: target.tileKey },
      "Image satellite indisponible",
    );
    return cached ? fromCache(cached) : { status: "unavailable" };
  }
}

function render(target: RenderTarget, now: Date): Promise<ImageryOutcome> {
  const key = `${target.layer}/${target.period}/${target.tileKey}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = renderCached(target, getRemoteSensingProvider(), now).finally(() => {
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

/** Tuile détaillée de 512 px (schéma XYZ), dans l'emprise du Bénin et aux zooms admis. */
export function getDetailTile(
  layer: SatelliteLayerCode,
  period: string,
  z: number,
  x: number,
  y: number,
  now = new Date(),
): Promise<ImageryOutcome> {
  if (!isDetailTileInBenin(z, x, y)) return Promise.resolve({ status: "empty" });
  return render(
    {
      layer,
      period,
      tileKey: `${z}/${x}/${y}`,
      envelope: tileToEnvelope3857(z, x, y),
      width: DETAIL_TILE_SIZE,
      height: DETAIL_TILE_SIZE,
    },
    now,
  );
}
