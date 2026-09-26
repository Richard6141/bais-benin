import { beforeEach, describe, expect, it, vi } from "vitest";

// Catalogue des périodes toujours rapide : une recherche Copernicus lente ne doit jamais faire
// attendre la carte, même à froid après un redémarrage.

const sql = vi.hoisted(() => ({ findCachedImage: vi.fn(), storeCachedImage: vi.fn() }));
const provider = vi.hoisted(() => ({
  id: "cdse",
  canProcess: true,
  provenance: { attribution: "Contains modified Copernicus Sentinel data" },
  searchScenes: vi.fn(),
}));

vi.mock("@/database/sql/satellite.sql", () => sql);
vi.mock("@/services/remote-sensing", () => ({ getRemoteSensingProvider: () => provider }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const NOW = new Date("2026-09-27T02:00:00Z");

function stored(checkedAt: string) {
  const catalog = {
    imageryAvailable: true,
    attribution: "x",
    defaultPeriod: "2026-09",
    periods: [{ period: "2026-09", label: "septembre 2026", clearSceneCount: 45 }],
    checkedAt,
    partial: false,
  };
  return { image: new TextEncoder().encode(JSON.stringify(catalog)), expiresAt: null };
}

async function load() {
  vi.resetModules();
  return (await import("../catalog")).getImageryCatalog;
}

describe("catalogue des périodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.storeCachedImage.mockResolvedValue(undefined);
  });

  it("répond tout de suite à froid, sans attendre Copernicus, la fenêtre de 60 jours par défaut", async () => {
    sql.findCachedImage.mockResolvedValue(null);
    provider.searchScenes.mockReturnValue(new Promise(() => {}));
    const getImageryCatalog = await load();
    const catalog = await getImageryCatalog(NOW);
    expect(catalog).toMatchObject({
      partial: true,
      imageryAvailable: true,
      defaultPeriod: "60-jours",
    });
    expect(catalog.periods).toHaveLength(13);
    // Le calcul complet est lancé derrière, sans délai de page au-delà de 12 s.
    expect(provider.searchScenes).toHaveBeenCalled();
    expect(provider.searchScenes.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 12_000 });
  });

  it("sert le catalogue gardé en base sans rien redemander tant qu'il a moins de six heures", async () => {
    sql.findCachedImage.mockResolvedValue(stored("2026-09-27T00:00:00.000Z"));
    const getImageryCatalog = await load();
    const catalog = await getImageryCatalog(NOW);
    expect(catalog).toMatchObject({ partial: false, defaultPeriod: "2026-09" });
    expect(provider.searchScenes).not.toHaveBeenCalled();
  });

  it("sert un catalogue ancien tout de suite et le refait en arrière-plan, puis le garde", async () => {
    sql.findCachedImage.mockResolvedValue(stored("2026-09-26T12:00:00.000Z"));
    provider.searchScenes.mockResolvedValue([]);
    const getImageryCatalog = await load();
    const first = await getImageryCatalog(NOW);
    expect(first.defaultPeriod).toBe("2026-09");
    await vi.waitFor(() => expect(sql.storeCachedImage).toHaveBeenCalled());
    expect(provider.searchScenes).toHaveBeenCalledTimes(13);
    const [layer, period, key, bytes] = sql.storeCachedImage.mock.calls[0]!;
    expect([layer, period, key]).toEqual(["TRUE_COLOR", "catalogue", "s2-benin-v1"]);
    expect(JSON.parse(new TextDecoder().decode(bytes as Uint8Array))).toMatchObject({
      partial: false,
      checkedAt: NOW.toISOString(),
    });
    const second = await getImageryCatalog(NOW);
    expect(second.checkedAt).toBe(NOW.toISOString());
  });
});
