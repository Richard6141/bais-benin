import { z } from "zod";
import { lonLatTo3857 } from "@/lib/geo/tile-math";
import {
  RemoteSensingNotConfiguredError,
  RemoteSensingProviderError,
  type CropAreaRequest,
  type CropAreaResult,
  type FieldFeatures,
  type FieldFeaturesRequest,
  type MultiPolygonGeometry,
  type RadarInterval,
  type RadarStatisticsRequest,
  type StatisticsResult,
  type ImageryRequest,
  type ImageryResult,
  type PolygonGeometry,
  type RemoteSensingProvider,
  type SceneSearchRequest,
  type SceneSummary,
  type VegetationInterval,
  type VegetationStatisticsRequest,
} from "@/services/ports/remote-sensing-provider";
import { cropMapColors } from "@/styles/tokens";
import { cropClassRenderEvalscript, cropClassStatisticsEvalscript } from "./crop-classes";
import {
  FIELD_FEATURES_EVALSCRIPT,
  NDVI_STATISTICS_EVALSCRIPT,
  RADAR_STATISTICS_EVALSCRIPT,
  renderEvalscript,
} from "./evalscripts";

// Adaptateur Copernicus Data Space Ecosystem (https://dataspace.copernicus.eu), sans
// intermédiaire commercial (ADR-0016) :
// - recherche des scènes Sentinel-2 L2A dans le catalogue STAC public, sans compte ;
// - images (API Process) et statistiques NDVI par parcelle (API Statistical), calculées côté
//   Copernicus, avec un client OAuth du compte CDSE gratuit (flux client_credentials).
// Les quotas du compte gratuit (10 000 requêtes par mois) sont gardés par le module satellite.

export const CDSE_DEFAULTS = {
  stacUrl: "https://stac.dataspace.copernicus.eu/v1",
  processingUrl: "https://sh.dataspace.copernicus.eu",
  tokenUrl:
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
} as const;

const COLLECTION = "sentinel-2-l2a";
const CRS_3857 = "http://www.opengis.net/def/crs/EPSG/0/3857";
const TIMEOUT_MS = 30_000;
// Une page de 1 000 scènes tient en une réponse (≈ 7 s pour un mois entier sur le pays).
const STAC_PAGE_SIZE = 1000;
// Marge avant l'expiration annoncée du jeton, pour ne pas l'envoyer périmé.
const TOKEN_MARGIN_S = 60;

export interface CdseOptions {
  clientId?: string;
  clientSecret?: string;
  stacUrl?: string;
  processingUrl?: string;
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const stacPageSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        datetime: z.string(),
        "eo:cloud_cover": z.number().nullable().optional(),
        platform: z.string().nullable().optional(),
        "grid:code": z.string().nullable().optional(),
      }),
    }),
  ),
  links: z
    .array(
      z.object({
        rel: z.string(),
        href: z.string(),
        method: z.string().optional(),
        body: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
});

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

// Une moyenne sans pixel valide revient en « NaN » (chaîne) : traitée comme absente.
const statValue = z.union([z.number(), z.string()]).transform((value) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
});

const statisticsSchema = z.object({
  data: z.array(
    z.object({
      interval: z.object({ from: z.string(), to: z.string() }),
      outputs: z
        .object({
          ndvi: z.object({
            bands: z.object({
              B0: z.object({
                stats: z.object({
                  mean: statValue,
                  stDev: statValue,
                  sampleCount: z.number(),
                  noDataCount: z.number(),
                }),
              }),
            }),
          }),
        })
        .optional(),
      error: z.unknown().optional(),
    }),
  ),
});

/**
 * Corps de recherche STAC : collection L2A, emprise, période, champs utiles seulement ; avec un
 * plafond de nébulosité, filtre CQL2 côté catalogue et scènes les plus dégagées d'abord.
 */
export function buildStacSearchBody(request: SceneSearchRequest) {
  const cloudFilter =
    request.maxCloudCover === undefined
      ? {}
      : {
          "filter-lang": "cql2-json",
          filter: {
            op: "<",
            args: [{ property: "eo:cloud_cover" }, request.maxCloudCover],
          },
        };
  return {
    collections: [COLLECTION],
    bbox: request.bbox,
    datetime: `${request.from}/${request.to}`,
    limit: Math.min(STAC_PAGE_SIZE, Math.max(1, request.limit)),
    ...cloudFilter,
    sortby: [
      request.maxCloudCover === undefined
        ? { field: "properties.datetime", direction: "desc" }
        : { field: "properties.eo:cloud_cover", direction: "asc" },
    ],
    fields: {
      include: [
        "id",
        "properties.datetime",
        "properties.eo:cloud_cover",
        "properties.platform",
        "properties.grid:code",
      ],
      exclude: ["assets", "links", "geometry", "bbox"],
    },
  };
}

/** Requête de l'API Process pour une emprise EPSG:3857 et une période. */
export function buildProcessBody(request: ImageryRequest) {
  // Carte des cultures : toute la série du pixel (un passage par mois, retenu par le script).
  const crop = request.layer === "CROP_CLASSES";
  // Mosaïque sans nuages : les passages sont choisis et triés par le script, pixel par pixel.
  const byOrbit = crop || request.cloudFree === true;
  return {
    input: {
      // Emprise de sortie (bbox) et découpe (geometry) : hors contour, pas de donnée.
      bounds: {
        bbox: request.envelope,
        ...(request.clip ? { geometry: request.clip } : {}),
        properties: { crs: CRS_3857 },
      },
      data: [
        {
          type: COLLECTION,
          dataFilter: {
            timeRange: { from: request.from, to: request.to },
            maxCloudCoverage: request.maxCloudCover,
            // La scène la moins nuageuse de la période passe devant les autres.
            ...(byOrbit ? {} : { mosaickingOrder: "leastCC" }),
          },
        },
      ],
    },
    output: {
      width: request.width,
      height: request.height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: crop
      ? cropClassRenderEvalscript(cropMapColors)
      : renderEvalscript(request.layer, request.cloudFree === true),
  };
}

/**
 * Surfaces par classe de culture sur une commune (ADR-0021) : histogramme des codes de classe
 * sur la géométrie, pixels de `resolutionM` mètres au sol, sur toute la période en un seul pas.
 */
export function buildCropAreaBody(request: CropAreaRequest) {
  const days = Math.max(
    1,
    Math.ceil((Date.parse(request.to) - Date.parse(request.from)) / 86_400_000),
  );
  // En Web Mercator, un mètre au sol vaut 1/cos(latitude) unités.
  const resolution = request.resolutionM / Math.cos((request.latitude * Math.PI) / 180);
  return {
    input: {
      bounds: { geometry: projectAny(request.geometry), properties: { crs: CRS_3857 } },
      data: [
        {
          type: COLLECTION,
          dataFilter: { maxCloudCoverage: 80 },
        },
      ],
    },
    aggregation: {
      timeRange: { from: request.from, to: request.to },
      aggregationInterval: { of: `P${days}D` },
      evalscript: cropClassStatisticsEvalscript(request.zoneOffset),
      resx: resolution,
      resy: resolution,
    },
    calculations: {
      default: { histograms: { default: { nBins: 10, lowEdge: 0, highEdge: 10 } } },
    },
  };
}

const cropAreaSchema = z.object({
  data: z.array(
    z.object({
      outputs: z.object({
        crop: z.object({
          bands: z.object({
            B0: z.object({
              histogram: z.object({
                bins: z.array(
                  z.object({ lowEdge: z.number(), highEdge: z.number(), count: z.number() }),
                ),
              }),
            }),
          }),
        }),
      }),
    }),
  ),
});

/** Pixels par code de classe (0 à 9), cumulés sur les intervalles renvoyés. */
export function parseCropArea(payload: unknown): number[] {
  const parsed = cropAreaSchema.parse(payload);
  const pixels = new Array<number>(10).fill(0);
  for (const entry of parsed.data) {
    for (const bin of entry.outputs.crop.bands.B0.histogram.bins) {
      const code = Math.round(bin.lowEdge);
      if (code >= 0 && code < pixels.length) pixels[code] = (pixels[code] ?? 0) + bin.count;
    }
  }
  return pixels;
}

function projectAny(
  geometry: PolygonGeometry | MultiPolygonGeometry,
): PolygonGeometry | MultiPolygonGeometry {
  if (geometry.type === "Polygon") return projectPolygon(geometry);
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map(
      (polygon) => projectPolygon({ type: "Polygon", coordinates: polygon }).coordinates,
    ),
  };
}

function projectPolygon(geometry: PolygonGeometry): PolygonGeometry {
  return {
    type: "Polygon",
    coordinates: geometry.coordinates.map((ring) =>
      ring.map(([lon, lat]) => lonLatTo3857(lon ?? 0, lat ?? 0)),
    ),
  };
}

/** Requête de l'API Statistical : NDVI moyen de la géométrie par pas de `intervalDays`. */
export function buildStatisticsBody(request: VegetationStatisticsRequest) {
  return {
    input: {
      // Géométrie projetée en EPSG:3857 : la résolution s'exprime alors en mètres.
      bounds: { geometry: projectPolygon(request.geometry), properties: { crs: CRS_3857 } },
      data: [{ type: COLLECTION, dataFilter: { mosaickingOrder: "leastCC" } }],
    },
    aggregation: {
      timeRange: { from: request.from, to: request.to },
      aggregationInterval: { of: `P${request.intervalDays}D` },
      evalscript: NDVI_STATISTICS_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: { default: {} },
  };
}

/** Fenêtre multi-dates pour la délimitation des champs, scènes très nuageuses écartées. */
export function buildFieldFeaturesBody(request: FieldFeaturesRequest) {
  return {
    input: {
      bounds: { bbox: request.envelope, properties: { crs: CRS_3857 } },
      data: [
        {
          type: COLLECTION,
          dataFilter: {
            timeRange: { from: request.from, to: request.to },
            // Moins de passages décomptés : les scènes couvertes à plus de 60 % n'apportent rien.
            maxCloudCoverage: 60,
          },
        },
      ],
    },
    output: {
      width: request.width,
      height: request.height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: FIELD_FEATURES_EVALSCRIPT,
  };
}

/** Décode les quatre canaux 8 bits (RGBA) en variables par pixel. */
export function decodeFieldFeatures(
  rgba: Uint8Array,
  width: number,
  height: number,
): Omit<FieldFeatures, "processingUnits"> {
  const size = width * height;
  const peak = new Float32Array(size);
  const low = new Float32Array(size);
  const swir = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const seen = rgba[i * 4 + 3] ?? 0;
    peak[i] = seen ? (rgba[i * 4] ?? 0) / 127.5 - 1 : Number.NaN;
    low[i] = seen ? (rgba[i * 4 + 1] ?? 0) / 127.5 - 1 : Number.NaN;
    swir[i] = seen ? (rgba[i * 4 + 2] ?? 0) / 255 : Number.NaN;
  }
  return { width, height, peak, low, swir };
}

const bandStats = z.object({
  bands: z.object({
    B0: z.object({
      stats: z.object({
        mean: statValue,
        sampleCount: z.number(),
        noDataCount: z.number(),
      }),
    }),
  }),
});

const radarStatisticsSchema = z.object({
  data: z.array(
    z.object({
      interval: z.object({ from: z.string(), to: z.string() }),
      outputs: z.object({ rvi: bandStats, vh: bandStats }).optional(),
    }),
  ),
});

/**
 * Requête radar de l'API Statistical (ADR-0019) : Sentinel-1 GRD en mode IW, double polarisation
 * VV + VH, rétrodiffusion normalisée au relief (GAMMA0_TERRAIN, orthorectifiée sur le MNT
 * Copernicus 30 m) et filtre de chatoiement de Lee 3 × 3 ; un seul sens d'orbite.
 */
export function buildRadarStatisticsBody(request: RadarStatisticsRequest) {
  return {
    input: {
      bounds: { geometry: projectPolygon(request.geometry), properties: { crs: CRS_3857 } },
      data: [
        {
          type: "sentinel-1-grd",
          dataFilter: {
            acquisitionMode: "IW",
            polarization: "DV",
            resolution: "HIGH",
            orbitDirection: request.orbitDirection,
          },
          processing: {
            backCoeff: "GAMMA0_TERRAIN",
            orthorectify: true,
            demInstance: "COPERNICUS_30",
            speckleFilter: { type: "LEE", windowSizeX: 3, windowSizeY: 3 },
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: request.from, to: request.to },
      aggregationInterval: { of: `P${request.intervalDays}D` },
      evalscript: RADAR_STATISTICS_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: { default: {} },
  };
}

export function parseRadarStatistics(payload: unknown): RadarInterval[] {
  const parsed = radarStatisticsSchema.parse(payload);
  return parsed.data.map((entry) => {
    const rvi = entry.outputs?.rvi.bands.B0.stats;
    const vh = entry.outputs?.vh.bands.B0.stats;
    const validPixels = rvi ? rvi.sampleCount - rvi.noDataCount : 0;
    return {
      from: entry.interval.from,
      to: entry.interval.to,
      rviMean: rvi && validPixels > 0 ? rvi.mean : null,
      vhDbMean: vh && validPixels > 0 ? vh.mean : null,
      validPixels,
      maskedPixels: rvi?.noDataCount ?? 0,
    };
  });
}

function spentUnits(response: Response): number | null {
  const spent = Number(response.headers.get("x-processingunits-spent"));
  return Number.isFinite(spent) && spent > 0 ? spent : null;
}

export function parseStatistics(payload: unknown): VegetationInterval[] {
  const parsed = statisticsSchema.parse(payload);
  return parsed.data.map((entry) => {
    const stats = entry.outputs?.ndvi.bands.B0.stats;
    const validPixels = stats ? stats.sampleCount - stats.noDataCount : 0;
    return {
      from: entry.interval.from,
      to: entry.interval.to,
      ndviMean: stats && validPixels > 0 ? stats.mean : null,
      ndviStdDev: stats && validPixels > 0 ? stats.stDev : null,
      validPixels,
      maskedPixels: stats?.noDataCount ?? 0,
    };
  });
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Lecture d'une réponse (JSON, schéma, image) : une réponse illisible devient un échec du
 * fournisseur, pas une erreur 500. L'appelant a déjà réservé son unité de quota ; il doit
 * pouvoir conclure proprement et, pour le lot quotidien, passer à la parcelle suivante (R2).
 */
export async function readResponse<T>(what: string, read: () => Promise<T> | T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof RemoteSensingProviderError) throw error;
    throw new RemoteSensingProviderError(
      `${what} : réponse illisible (${error instanceof Error ? error.message.slice(0, 120) : "format inattendu"})`,
      false,
    );
  }
}

export function createCdseProvider(options: CdseOptions = {}): RemoteSensingProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const stacUrl = (options.stacUrl ?? CDSE_DEFAULTS.stacUrl).replace(/\/$/, "");
  const processingUrl = (options.processingUrl ?? CDSE_DEFAULTS.processingUrl).replace(/\/$/, "");
  const tokenUrl = options.tokenUrl ?? CDSE_DEFAULTS.tokenUrl;
  const { clientId, clientSecret } = options;
  const canProcess = Boolean(clientId && clientSecret);
  let token: { value: string; expiresAt: number } | null = null;

  async function send(url: string, init: RequestInit, what: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new RemoteSensingProviderError(
        `${what} : Copernicus injoignable (${error instanceof Error ? error.message : "erreur réseau"})`,
        true,
      );
    }
    if (!response.ok) {
      throw new RemoteSensingProviderError(
        `${what} : Copernicus a répondu ${response.status}`,
        retryableStatus(response.status),
        response.status,
      );
    }
    return response;
  }

  async function accessToken(): Promise<string> {
    if (!clientId || !clientSecret) throw new RemoteSensingNotConfiguredError();
    if (token && token.expiresAt > now()) return token.value;
    const response = await send(
      tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      "Jeton CDSE",
    );
    const parsed = await readResponse("Jeton CDSE", async () =>
      tokenSchema.parse(await response.json()),
    );
    token = {
      value: parsed.access_token,
      expiresAt: now() + Math.max(0, parsed.expires_in - TOKEN_MARGIN_S) * 1000,
    };
    return token.value;
  }

  async function processing(path: string, body: unknown, accept: string): Promise<Response> {
    const bearer = await accessToken();
    return send(
      `${processingUrl}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Accept: accept,
        },
        body: JSON.stringify(body),
      },
      path.includes("statistics") ? "Statistiques CDSE" : "Image CDSE",
    );
  }

  return {
    id: "cdse",
    canProcess,
    provenance: {
      sourceId: "COPERNICUS_S2",
      reliability: "ESTIMATED",
      licence: "Licence Copernicus : accès libre et gratuit, attribution obligatoire",
      attribution: "Contains modified Copernicus Sentinel data",
    },
    radarProvenance: {
      sourceId: "COPERNICUS_S1",
      reliability: "ESTIMATED",
      licence: "Licence Copernicus : accès libre et gratuit, attribution obligatoire",
      attribution: "Contains modified Copernicus Sentinel data",
    },

    async searchScenes(request): Promise<SceneSummary[]> {
      const scenes: SceneSummary[] = [];
      let body: Record<string, unknown> | undefined = buildStacSearchBody(request);
      while (body && scenes.length < request.limit) {
        const response = await send(
          `${stacUrl}/search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/geo+json" },
            body: JSON.stringify(body),
          },
          "Catalogue STAC",
        );
        const page = await readResponse("Catalogue STAC", async () =>
          stacPageSchema.parse(await response.json()),
        );
        for (const feature of page.features) {
          scenes.push({
            id: feature.id,
            acquiredAt: feature.properties.datetime,
            cloudCover: feature.properties["eo:cloud_cover"] ?? null,
            platform: feature.properties.platform ?? null,
            gridCode: feature.properties["grid:code"] ?? null,
          });
        }
        // Pagination STAC : le lien « next » porte le corps de la page suivante.
        const next = page.links.find((link) => link.rel === "next");
        body = page.features.length > 0 && next?.body ? next.body : undefined;
      }
      return scenes.slice(0, request.limit);
    },

    async renderImage(request): Promise<ImageryResult> {
      const response = await processing("/api/v1/process", buildProcessBody(request), "image/png");
      const spent = Number(response.headers.get("x-processingunits-spent"));
      const image = await readResponse(
        "Image CDSE",
        async () => new Uint8Array(await response.arrayBuffer()),
      );
      return { image, processingUnits: Number.isFinite(spent) && spent > 0 ? spent : null };
    },

    async vegetationStatistics(request): Promise<StatisticsResult<VegetationInterval>> {
      const response = await processing(
        "/api/v1/statistics",
        buildStatisticsBody(request),
        "application/json",
      );
      const intervals = await readResponse("Statistiques CDSE", async () =>
        parseStatistics(await response.json()),
      );
      return { intervals, processingUnits: spentUnits(response) };
    },

    async cropAreaStatistics(request): Promise<CropAreaResult> {
      const response = await processing(
        "/api/v1/statistics",
        buildCropAreaBody(request),
        "application/json",
      );
      const classPixels = await readResponse("Surfaces des cultures CDSE", async () =>
        parseCropArea(await response.json()),
      );
      return { classPixels, processingUnits: spentUnits(response) };
    },

    async radarStatistics(request): Promise<StatisticsResult<RadarInterval>> {
      const response = await processing(
        "/api/v1/statistics",
        buildRadarStatisticsBody(request),
        "application/json",
      );
      const intervals = await readResponse("Statistiques radar CDSE", async () =>
        parseRadarStatistics(await response.json()),
      );
      return { intervals, processingUnits: spentUnits(response) };
    },

    async fieldFeatures(request): Promise<FieldFeatures> {
      const response = await processing(
        "/api/v1/process",
        buildFieldFeaturesBody(request),
        "image/png",
      );
      const spent = Number(response.headers.get("x-processingunits-spent"));
      // sharp n'est chargé qu'ici : les autres usages de l'adaptateur n'en ont pas besoin.
      const { data, info } = await readResponse("Variables de champ CDSE", async () => {
        const { default: sharp } = await import("sharp");
        return sharp(Buffer.from(await response.arrayBuffer()))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      });
      if (info.width !== request.width || info.height !== request.height || info.channels !== 4) {
        throw new RemoteSensingProviderError("Variables de champ CDSE : image inattendue", false);
      }
      return {
        ...decodeFieldFeatures(new Uint8Array(data), info.width, info.height),
        processingUnits: Number.isFinite(spent) && spent > 0 ? spent : null,
      };
    },
  };
}
