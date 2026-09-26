import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteSensingProviderError } from "@/services/ports/remote-sensing-provider";

// Passe mensuelle des surfaces par commune (ADR-0021), base et quota simulés : ce que le lot
// calcule, écrit, et où il s'arrête.

const sql = vi.hoisted(() => ({
  listCommunesForCropAreas: vi.fn(),
  countCommunesForCropAreas: vi.fn(),
  communesWithMeasuredCropAreas: vi.fn(),
  declaredAreasByCrop: vi.fn(),
  upsertCropAreas: vi.fn(),
}));
const quota = vi.hoisted(() => ({
  reserveProcessingRequest: vi.fn(),
  addProcessingUnits: vi.fn(),
}));

vi.mock("@/database/client", () => ({
  prisma: {
    agriculturalCampaign: {
      findFirst: async () => ({ id: "campaign", code: "2026-2027" }),
    },
  },
}));
vi.mock("@/database/sql/crop-areas.sql", () => sql);
vi.mock("@/database/sql/satellite.sql", () => quota);
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    SATELLITE_MONTHLY_REQUEST_BUDGET: 9000,
    SATELLITE_PROPOSAL_SHARE: 0.3,
    SATELLITE_STATISTICS_SHARE: 0.5,
    SATELLITE_MONTHLY_UNIT_BUDGET: 9000,
    SATELLITE_REQUESTS_PER_MINUTE: 250,
  }),
}));

const { cropAreaRows, cropMapClassOf, runCropAreaEstimates } = await import("../crop-areas");

const SQUARE = JSON.stringify({
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [2.3, 9.3],
        [2.4, 9.3],
        [2.4, 9.4],
        [2.3, 9.3],
      ],
    ],
  ],
});

function commune(code: string, zone: string | null = null) {
  return {
    id: `id-${code}`,
    code,
    zone_code: zone,
    latitude: 9.35,
    area_ha: 10_000,
    geometry: SQUARE,
  };
}

function provider(
  cropAreaStatistics: (request: { zoneOffset: number }) => Promise<unknown>,
  id = "cdse",
) {
  return {
    id,
    canProcess: true,
    provenance: {
      sourceId: "COPERNICUS_S2",
      reliability: "ESTIMATED",
      licence: "",
      attribution: "",
    },
    cropAreaStatistics: vi.fn(cropAreaStatistics),
  } as never;
}

const PIXELS = [10, 5, 50, 0, 10, 0, 15, 10, 0, 0];
const NOW = new Date("2026-10-03T05:30:00Z");

describe("classe de la carte d'une culture du registre", () => {
  it("range chaque culture dans la classe que le satellite distingue", () => {
    expect(cropMapClassOf("RICE")).toBe("RICE");
    expect(cropMapClassOf("COTTON")).toBe("COTTON");
    expect(cropMapClassOf("CASHEW")).toBe("PERENNIAL");
    expect(cropMapClassOf("TOMATO")).toBe("GARDEN");
    expect(cropMapClassOf("MAIZE")).toBe("ANNUAL");
    expect(cropMapClassOf("YAM")).toBe("ANNUAL");
  });
});

describe("lignes d'une commune", () => {
  const context = {
    communeId: "c",
    campaignId: "k",
    communeAreaHa: 1000,
    windowFrom: new Date("2025-10-03"),
    windowTo: NOW,
    sourceId: "COPERNICUS_S2",
    reliability: "ESTIMATED" as const,
    computedAt: NOW,
  };

  it("applique la part des pixels à la surface de la commune, classe par classe", () => {
    const rows = cropAreaRows(PIXELS, context);
    expect(rows).toHaveLength(10);
    const annual = rows.find((row) => row.cropClass === "ANNUAL");
    expect(annual?.areaHa).toBe(500);
    expect(annual?.pixelShare).toBe(0.5);
    expect(rows.every((row) => row.unclassifiedShare === 0.1)).toBe(true);
  });

  it("marque une commune sans pixel exploitable comme non classée, pour avancer le curseur", () => {
    const rows = cropAreaRows(new Array(10).fill(0), context);
    expect(rows).toEqual([
      expect.objectContaining({ cropClass: "UNCLASSIFIED", areaHa: 1000, unclassifiedShare: 1 }),
    ]);
  });
});

describe("passe mensuelle des surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.countCommunesForCropAreas.mockResolvedValue(0);
  });

  it("calcule chaque commune dans la part des statistiques et rend les unités par commune", async () => {
    sql.listCommunesForCropAreas.mockResolvedValue([commune("A", "ZAE_1"), commune("B")]);
    quota.reserveProcessingRequest.mockResolvedValue("reserved");
    const source = provider(async () => ({ classPixels: PIXELS, processingUnits: 11.5 }));

    const result = await runCropAreaEstimates({ provider: source, limit: 12, now: NOW });

    expect(result).toMatchObject({ computed: 2, stopped: null, processingUnits: 23 });
    expect(result.perCommune).toEqual([
      { code: "A", processingUnits: 11.5 },
      { code: "B", processingUnits: 11.5 },
    ]);
    expect(quota.reserveProcessingRequest).toHaveBeenCalledWith(
      "2026-10",
      "STATISTICS",
      expect.anything(),
      NOW,
    );
    // Seuils abaissés dans la zone la plus sèche.
    const calls = (source as unknown as { cropAreaStatistics: { mock: { calls: unknown[][] } } })
      .cropAreaStatistics.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ zoneOffset: 0.08, resolutionM: 100 });
    expect(calls[1]?.[0]).toMatchObject({ zoneOffset: 0 });
    // Curseur : communes non calculées depuis le début du mois.
    expect(sql.listCommunesForCropAreas).toHaveBeenCalledWith(
      expect.objectContaining({
        staleBefore: new Date("2026-10-01T00:00:00Z"),
        replaceSynthetic: true,
        limit: 12,
      }),
    );
    expect(sql.upsertCropAreas).toHaveBeenCalledTimes(2);
  });

  it("s'arrête net quand la part des statistiques est épuisée, sans appeler Copernicus", async () => {
    sql.listCommunesForCropAreas.mockResolvedValue([commune("A"), commune("B"), commune("C")]);
    sql.countCommunesForCropAreas.mockResolvedValue(2);
    quota.reserveProcessingRequest
      .mockResolvedValueOnce("reserved")
      .mockResolvedValueOnce("share-exhausted");
    const source = provider(async () => ({ classPixels: PIXELS, processingUnits: 12 }));

    const result = await runCropAreaEstimates({ provider: source, limit: 12, now: NOW });

    expect(result).toMatchObject({ computed: 1, stopped: "share-exhausted", remaining: 2 });
    expect(sql.upsertCropAreas).toHaveBeenCalledTimes(1);
  });

  it("s'arrête après trois échecs de Copernicus d'affilée", async () => {
    sql.listCommunesForCropAreas.mockResolvedValue(
      ["A", "B", "C", "D"].map((code) => commune(code)),
    );
    quota.reserveProcessingRequest.mockResolvedValue("reserved");
    const source = provider(async () => {
      throw new RemoteSensingProviderError("indisponible", true, 503);
    });

    const result = await runCropAreaEstimates({ provider: source, limit: 12, now: NOW });

    expect(result).toMatchObject({ computed: 0, errors: 3, stopped: "provider-unavailable" });
    expect(sql.upsertCropAreas).not.toHaveBeenCalled();
  });

  it("ne touche pas au quota avec la fixture", async () => {
    sql.listCommunesForCropAreas.mockResolvedValue([commune("A")]);
    const source = provider(
      async () => ({ classPixels: PIXELS, processingUnits: null }),
      "fixture",
    );

    const result = await runCropAreaEstimates({ provider: source, limit: 12, now: NOW });

    expect(result.computed).toBe(1);
    expect(quota.reserveProcessingRequest).not.toHaveBeenCalled();
  });
});
