import { z } from "zod";
import { lonLatTo3857 } from "@/lib/geo/tile-math";
import {
  RemoteSensingNotConfiguredError,
  RemoteSensingProviderError,
  type ImageryRequest,
  type ImageryResult,
  type PolygonGeometry,
  type RemoteSensingProvider,
  type SceneSearchRequest,
  type SceneSummary,
  type VegetationInterval,
  type VegetationStatisticsRequest,
} from "@/services/ports/remote-sensing-provider";
import { NDVI_STATISTICS_EVALSCRIPT, renderEvalscript } from "./evalscripts";

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
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    output: {
      width: request.width,
      height: request.height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: renderEvalscript(request.layer),
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
    const parsed = tokenSchema.parse(await response.json());
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
        const page = stacPageSchema.parse(await response.json());
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
      return {
        image: new Uint8Array(await response.arrayBuffer()),
        processingUnits: Number.isFinite(spent) && spent > 0 ? spent : null,
      };
    },

    async vegetationStatistics(request): Promise<VegetationInterval[]> {
      const response = await processing(
        "/api/v1/statistics",
        buildStatisticsBody(request),
        "application/json",
      );
      return parseStatistics(await response.json());
    },
  };
}
