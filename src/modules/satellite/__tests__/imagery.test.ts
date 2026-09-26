import { beforeEach, describe, expect, it, vi } from "vitest";

// Cache et quota simulés : le test vérifie qu'une période hors des mois proposés ne touche ni
// au cache, ni au plafond mensuel, ni à Copernicus.
const OUTLINE = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};
const sql = vi.hoisted(() => ({
  readCountryOutline3857: vi.fn(),
  findCachedImage: vi.fn(),
  storeCachedImage: vi.fn(),
  reserveProcessingRequest: vi.fn(),
  addProcessingUnits: vi.fn(),
}));
const provider = vi.hoisted(() => ({
  id: "cdse",
  canProcess: true,
  renderImage: vi.fn(),
}));

vi.mock("@/database/sql/satellite.sql", () => sql);
vi.mock("@/services/remote-sensing", () => ({ getRemoteSensingProvider: () => provider }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ SATELLITE_MONTHLY_REQUEST_BUDGET: 9000 }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { getDetailTile, getOverviewImage } = await import("../imagery");

const NOW = new Date("2026-09-26T08:00:00Z");

describe("images de la vue du ciel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.readCountryOutline3857.mockResolvedValue(OUTLINE);
  });

  it("refusent un mois hors de la période proposée sans cache, sans quota ni Copernicus", async () => {
    for (const period of ["1900-01", "2025-09", "2026-10", "2099-12"]) {
      expect(await getOverviewImage("NDVI", period, NOW)).toEqual({ status: "period-not-offered" });
      expect(await getDetailTile("TRUE_COLOR", period, 10, 516, 484, NOW)).toEqual({
        status: "period-not-offered",
      });
    }
    expect(sql.findCachedImage).not.toHaveBeenCalled();
    expect(sql.reserveProcessingRequest).not.toHaveBeenCalled();
    expect(provider.renderImage).not.toHaveBeenCalled();
  });

  it("réservent le quota avant d'appeler Copernicus pour un mois proposé absent du cache", async () => {
    sql.findCachedImage.mockResolvedValue(null);
    sql.reserveProcessingRequest.mockResolvedValue(true);
    provider.renderImage.mockResolvedValue({ image: new Uint8Array([1]), processingUnits: 7.5 });
    const outcome = await getOverviewImage("NDVI", "2025-10", NOW);
    expect(outcome).toEqual({ status: "ok", image: new Uint8Array([1]), permanent: true });
    expect(sql.reserveProcessingRequest).toHaveBeenCalledWith("2026-09", "IMAGE", 9000);
    expect(sql.addProcessingUnits).toHaveBeenCalledWith("2026-09", 7.5);
    // Image découpée sur la frontière du pays, rangée sous la version v2 du cache.
    expect(provider.renderImage).toHaveBeenCalledWith(expect.objectContaining({ clip: OUTLINE }));
    expect(sql.storeCachedImage).toHaveBeenCalledWith(
      "NDVI",
      "2025-10",
      "v2:overview",
      new Uint8Array([1]),
      null,
    );
  });

  it("n'appellent pas Copernicus une fois le plafond atteint", async () => {
    sql.findCachedImage.mockResolvedValue(null);
    sql.reserveProcessingRequest.mockResolvedValue(false);
    expect(await getOverviewImage("TRUE_COLOR", "2026-08", NOW)).toEqual({
      status: "budget-exhausted",
    });
    expect(provider.renderImage).not.toHaveBeenCalled();
  });
});
