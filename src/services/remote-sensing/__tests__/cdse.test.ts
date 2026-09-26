import { describe, expect, it, vi } from "vitest";
import {
  RemoteSensingNotConfiguredError,
  RemoteSensingProviderError,
} from "@/services/ports/remote-sensing-provider";
import {
  buildFieldFeaturesBody,
  buildProcessBody,
  decodeFieldFeatures,
  buildStacSearchBody,
  buildStatisticsBody,
  createCdseProvider,
  parseStatistics,
} from "../cdse";
import { MASKED_SCL_CLASSES, NDVI_STATISTICS_EVALSCRIPT, renderEvalscript } from "../evalscripts";

const BENIN = [0.6, 5.9, 4.0, 12.5] as const;

function stacFeature(id: string, datetime: string, cloud: number) {
  return {
    id,
    properties: {
      datetime,
      "eo:cloud_cover": cloud,
      platform: "sentinel-2a",
      "grid:code": "MGRS-31PDM",
    },
  };
}

function tokenResponse() {
  return Response.json({ access_token: "jeton-test", expires_in: 600 });
}

describe("adaptateur Copernicus Data Space Ecosystem", () => {
  it("interroge le catalogue STAC public sur la collection L2A, sans compte", async () => {
    const body = buildStacSearchBody({
      bbox: BENIN,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z",
      limit: 500,
    });
    expect(body.collections).toEqual(["sentinel-2-l2a"]);
    expect(body.datetime).toBe("2026-08-01T00:00:00.000Z/2026-08-31T23:59:59.000Z");
    expect(body.limit).toBe(500);
    expect(body.fields.exclude).toContain("assets");
    expect(body).not.toHaveProperty("filter");

    const clear = buildStacSearchBody({
      bbox: BENIN,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z",
      limit: 5000,
      maxCloudCover: 30,
    });
    expect(clear.limit).toBe(1000);
    expect(clear).toMatchObject({
      "filter-lang": "cql2-json",
      filter: { op: "<", args: [{ property: "eo:cloud_cover" }, 30] },
      sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          features: [stacFeature("A", "2026-08-30T10:15:00Z", 12.5)],
          links: [
            { rel: "next", href: "https://stac/search", method: "POST", body: { token: "p2" } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ features: [stacFeature("B", "2026-08-25T10:15:00Z", 3)], links: [] }),
      );
    const provider = createCdseProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(provider.canProcess).toBe(false);
    const scenes = await provider.searchScenes({
      bbox: BENIN,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z",
      limit: 10,
    });
    expect(scenes.map((scene) => [scene.id, scene.cloudCover, scene.gridCode])).toEqual([
      ["A", 12.5, "MGRS-31PDM"],
      ["B", 3, "MGRS-31PDM"],
    ]);
    // La page suivante reprend le corps fourni par le lien « next ».
    const secondCall = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(secondCall[0]).toBe("https://stac.dataspace.copernicus.eu/v1/search");
    expect(JSON.parse(String(secondCall[1].body))).toEqual({ token: "p2" });
  });

  it("refuse le traitement tant que le client OAuth n'est pas configuré", async () => {
    const provider = createCdseProvider({ fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(
      provider.renderImage({
        layer: "NDVI",
        envelope: [0, 0, 1, 1],
        width: 512,
        height: 512,
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-31T23:59:59Z",
        maxCloudCover: 80,
      }),
    ).rejects.toBeInstanceOf(RemoteSensingNotConfiguredError);
  });

  it("obtient un jeton une seule fois et l'envoie à l'API Process", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("openid-connect")
        ? tokenResponse()
        : new Response(png, { headers: { "x-processingunits-spent": "1.33" } }),
    );
    const provider = createCdseProvider({
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const request = {
      layer: "TRUE_COLOR" as const,
      envelope: [1, 2, 3, 4] as const,
      width: 512,
      height: 512,
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T23:59:59Z",
      maxCloudCover: 80,
    };
    const first = await provider.renderImage(request);
    await provider.renderImage(request);
    expect(first?.image).toEqual(png);
    expect(first?.processingUnits).toBeCloseTo(1.33);
    const tokenCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes("openid"));
    expect(tokenCalls).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://sh.dataspace.copernicus.eu/api/v1/process");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jeton-test");
  });

  it("décrit l'emprise en EPSG:3857 et fait passer la scène la moins nuageuse devant", () => {
    const body = buildProcessBody({
      layer: "NDVI",
      envelope: [10, 20, 30, 40],
      width: 512,
      height: 512,
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T23:59:59Z",
      maxCloudCover: 80,
    });
    expect(body.input.bounds).toEqual({
      bbox: [10, 20, 30, 40],
      properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/3857" },
    });
    expect(body.input.data[0]?.dataFilter.mosaickingOrder).toBe("leastCC");
    const clip = {
      type: "Polygon" as const,
      coordinates: [
        [
          [10, 20],
          [30, 20],
          [30, 40],
          [10, 20],
        ],
      ],
    };
    const clipped = buildProcessBody({
      layer: "NDVI",
      envelope: [10, 20, 30, 40],
      clip,
      width: 512,
      height: 512,
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T23:59:59Z",
      maxCloudCover: 80,
    });
    expect(clipped.input.bounds).toMatchObject({ bbox: [10, 20, 30, 40], geometry: clip });
    expect(body.output.responses[0]?.format.type).toBe("image/png");
    expect(body.evalscript).toContain("B08");
  });

  it("projette la parcelle en EPSG:3857 et agrège le NDVI par décade à 10 m", () => {
    const body = buildStatisticsBody({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0.001, 0],
            [0.001, 0.001],
            [0, 0],
          ],
        ],
      },
      from: "2026-05-01T00:00:00Z",
      to: "2026-10-31T23:59:59Z",
      intervalDays: 10,
    });
    const ring = body.input.bounds.geometry.coordinates[0] ?? [];
    expect(ring[1]?.[0]).toBeCloseTo(111.32, 1);
    expect(body.aggregation.aggregationInterval.of).toBe("P10D");
    expect(body.aggregation.resx).toBe(10);
  });

  it("traite une décade sans pixel valide comme absente, pas comme un NDVI nul", () => {
    const intervals = parseStatistics({
      data: [
        {
          interval: { from: "2026-07-01T00:00:00Z", to: "2026-07-11T00:00:00Z" },
          outputs: {
            ndvi: {
              bands: {
                B0: { stats: { mean: 0.62, stDev: 0.08, sampleCount: 150, noDataCount: 30 } },
              },
            },
          },
        },
        {
          interval: { from: "2026-07-11T00:00:00Z", to: "2026-07-21T00:00:00Z" },
          outputs: {
            ndvi: {
              bands: {
                B0: { stats: { mean: "NaN", stDev: "NaN", sampleCount: 150, noDataCount: 150 } },
              },
            },
          },
        },
      ],
    });
    expect(intervals[0]).toMatchObject({ ndviMean: 0.62, validPixels: 120, maskedPixels: 30 });
    expect(intervals[1]).toMatchObject({ ndviMean: null, validPixels: 0 });
  });

  it("signale une erreur réessayable sur un refus temporaire de Copernicus", async () => {
    const fetchImpl = vi.fn(async () => new Response("trop de requêtes", { status: 429 }));
    const provider = createCdseProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await provider
      .searchScenes({ bbox: BENIN, from: "a", to: "b", limit: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RemoteSensingProviderError);
    expect((error as RemoteSensingProviderError).retryable).toBe(true);
    expect((error as RemoteSensingProviderError).status).toBe(429);
  });
});

describe("scripts d'évaluation", () => {
  it("masquent nuages, ombres et neige dans le NDVI", () => {
    expect(MASKED_SCL_CLASSES).toEqual(expect.arrayContaining([3, 8, 9, 10, 11]));
    expect(renderEvalscript("NDVI")).toContain("[0, 0, 0, 0]");
    expect(NDVI_STATISTICS_EVALSCRIPT).toContain("dataMask");
  });

  it("gardent la couleur naturelle sans masque de nuages, seulement l'absence de donnée", () => {
    const script = renderEvalscript("TRUE_COLOR");
    expect(script).toContain("s.dataMask");
    expect(script).not.toContain("SCL");
  });
});

describe("variables de délimitation des champs", () => {
  it("demandent tous les passages de la période, nuages très couverts écartés", () => {
    const body = buildFieldFeaturesBody({
      envelope: [0, 0, 640, 640],
      width: 64,
      height: 64,
      from: "2025-11-30T00:00:00Z",
      to: "2026-09-26T00:00:00Z",
    });
    expect(body.evalscript).toContain('mosaicking: "ORBIT"');
    expect(body.evalscript).toContain("B11");
    expect(body.input.data[0]?.dataFilter.maxCloudCoverage).toBe(60);
    expect(body.output).toMatchObject({ width: 64, height: 64 });
  });

  it("décodent les quatre canaux 8 bits, et rien là où aucun passage n'a été vu", () => {
    // Pixel 1 : NDVI 0,7 / 0,2, B11 0,16, 12 passages. Pixel 2 : jamais vu.
    const rgba = new Uint8Array([217, 153, 41, 12, 0, 0, 0, 0]);
    const features = decodeFieldFeatures(rgba, 2, 1);
    expect(features.peak[0]).toBeCloseTo(0.702, 2);
    expect(features.low[0]).toBeCloseTo(0.2, 2);
    expect(features.swir[0]).toBeCloseTo(0.161, 2);
    expect(Number.isNaN(features.peak[1])).toBe(true);
  });
});
