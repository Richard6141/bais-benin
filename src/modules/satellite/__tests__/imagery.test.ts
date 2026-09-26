import { beforeEach, describe, expect, it, vi } from "vitest";

// Cache et quota simulés : le test vérifie qu'une période hors des mois proposés ne touche ni
// au cache, ni au plafond mensuel, ni à Copernicus.
// Contour fictif en EPSG:3857 : de 1,5 à 4 degrés est et de 6 à 12,5 degrés nord. Une tuile vers
// 0,8 degré est reste dans le rectangle du Bénin mais hors de ce contour.
const OUTLINE = {
  type: "Polygon",
  coordinates: [
    [
      [166_979, 669_141],
      [445_278, 669_141],
      [445_278, 1_402_734],
      [166_979, 1_402_734],
      [166_979, 669_141],
    ],
  ],
};
const rateLimit = vi.hoisted(() => ({ consumeRateLimit: vi.fn() }));
const sql = vi.hoisted(() => ({
  readCountryOutline3857: vi.fn(),
  holdAfterFailure: vi.fn(),
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
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    SATELLITE_MONTHLY_REQUEST_BUDGET: 9000,
    SATELLITE_PROPOSAL_SHARE: 0.3,
    SATELLITE_STATISTICS_SHARE: 0.5,
    SATELLITE_MONTHLY_UNIT_BUDGET: 9000,
    SATELLITE_REQUESTS_PER_MINUTE: 250,
    SATELLITE_TILE_MISSES_PER_ACCOUNT: 400,
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => rateLimit);

const { getDetailTile, getOverviewImage } = await import("../imagery");

const NOW = new Date("2026-09-26T08:00:00Z");

describe("images de la vue du ciel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.readCountryOutline3857.mockResolvedValue(OUTLINE);
    rateLimit.consumeRateLimit.mockResolvedValue(true);
  });

  it("refusent un mois hors de la période proposée sans cache, sans quota ni Copernicus", async () => {
    for (const period of ["1900-01", "2025-09", "2026-10", "2099-12"]) {
      expect(await getOverviewImage("NDVI", period, NOW)).toEqual({ status: "period-not-offered" });
      expect(await getDetailTile("TRUE_COLOR", period, 10, 516, 484, { now: NOW })).toEqual({
        status: "period-not-offered",
      });
    }
    expect(sql.findCachedImage).not.toHaveBeenCalled();
    expect(sql.reserveProcessingRequest).not.toHaveBeenCalled();
    expect(provider.renderImage).not.toHaveBeenCalled();
  });

  it("réservent le quota avant d'appeler Copernicus pour un mois proposé absent du cache", async () => {
    sql.findCachedImage.mockResolvedValue(null);
    sql.reserveProcessingRequest.mockResolvedValue("reserved");
    provider.renderImage.mockResolvedValue({ image: new Uint8Array([1]), processingUnits: 7.5 });
    const outcome = await getOverviewImage("NDVI", "2025-10", NOW);
    expect(outcome).toEqual({ status: "ok", image: new Uint8Array([1]), permanent: true });
    expect(sql.reserveProcessingRequest).toHaveBeenCalledWith(
      "2026-09",
      "IMAGE",
      {
        total: 9000,
        proposalShare: 0.3,
        statisticsShare: 0.5,
        processingUnits: 9000,
        perMinute: 250,
      },
      NOW,
    );
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
    sql.reserveProcessingRequest.mockResolvedValue("share-exhausted");
    expect(await getOverviewImage("TRUE_COLOR", "2026-08", NOW)).toEqual({
      status: "budget-exhausted",
    });
    expect(provider.renderImage).not.toHaveBeenCalled();
  });

  it("ne réservent rien pour une tuile du rectangle du Bénin mais hors de sa frontière", async () => {
    // z10, x=514 : vers 0,8 degré est, dans le rectangle, hors du contour fictif.
    expect(await getDetailTile("NDVI", "2026-08", 10, 514, 484, { now: NOW })).toEqual({
      status: "empty",
    });
    expect(sql.findCachedImage).not.toHaveBeenCalled();
    expect(sql.reserveProcessingRequest).not.toHaveBeenCalled();
  });

  it("plafonnent par compte les seules tuiles absentes du cache", async () => {
    sql.findCachedImage.mockResolvedValueOnce({ image: new Uint8Array([7]), expiresAt: null });
    expect(
      await getDetailTile("NDVI", "2026-08", 10, 516, 484, { now: NOW, requesterId: "agent-1" }),
    ).toMatchObject({ status: "ok" });
    // Tuile déjà en cache : ni le compte ni le quota ne sont touchés.
    expect(rateLimit.consumeRateLimit).not.toHaveBeenCalled();

    sql.findCachedImage.mockResolvedValue(null);
    rateLimit.consumeRateLimit.mockResolvedValue(false);
    expect(
      await getDetailTile("NDVI", "2026-08", 10, 516, 485, { now: NOW, requesterId: "agent-1" }),
    ).toEqual({ status: "account-limit" });
    expect(rateLimit.consumeRateLimit).toHaveBeenCalledWith("satellite-miss:agent-1:2026-09", {
      windowSeconds: 40 * 86_400,
      max: 400,
    });
    expect(sql.reserveProcessingRequest).not.toHaveBeenCalled();
  });

  it("gardent un échec de Copernicus une heure, sans redemander aussitôt", async () => {
    const { RemoteSensingProviderError } = await import("@/services/ports/remote-sensing-provider");
    sql.findCachedImage.mockResolvedValue(null);
    sql.reserveProcessingRequest.mockResolvedValue("reserved");
    provider.renderImage.mockRejectedValue(new RemoteSensingProviderError("panne", true, 503));
    expect(await getOverviewImage("NDVI", "2026-07", NOW)).toEqual({ status: "unavailable" });
    expect(sql.holdAfterFailure).toHaveBeenCalledWith(
      "NDVI",
      "2026-07",
      "v2:overview",
      new Date(NOW.getTime() + 3_600_000),
    );
  });

  it("signalent la limite par minute de Copernicus", async () => {
    sql.findCachedImage.mockResolvedValue(null);
    sql.reserveProcessingRequest.mockResolvedValue("throttled");
    expect(await getOverviewImage("TRUE_COLOR", "2026-06", NOW)).toEqual({ status: "throttled" });
    expect(provider.renderImage).not.toHaveBeenCalled();
  });
});
