import { afterEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  addProcessingUnits,
  findCachedImage,
  holdAfterFailure,
  readProcessingUsage,
  reserveProcessingRequest,
  storeCachedImage,
  type ProcessingBudget,
} from "@/database/sql/satellite.sql";

// Vue du ciel (ADR-0016, revue R2) : garde-fous du quota Copernicus et cache des images, sur la
// vraie base. Mois fictif, isolé des mois réels et retiré après chaque cas.
const MONTH = "2099-01";
const AT = new Date("2099-01-15T10:00:00Z");

// Plafond de 20 : 6 propositions, 10 statistiques, 4 images ; 100 PU ; 1 000 par minute.
const BUDGET: ProcessingBudget = {
  total: 20,
  proposalShare: 0.3,
  statisticsShare: 0.5,
  processingUnits: 100,
  perMinute: 1000,
};

async function clean() {
  await prisma.satelliteTile.deleteMany({ where: { period: MONTH } });
  await prisma.satelliteUsage.deleteMany({ where: { month: MONTH } });
}

describe("garde-fous du quota Copernicus", () => {
  afterEach(clean);
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("tient trois parts étanches, même sous des demandes concurrentes", async () => {
    const images = await Promise.all(
      Array.from({ length: 8 }, () => reserveProcessingRequest(MONTH, "IMAGE", BUDGET, AT)),
    );
    const statistics = await Promise.all(
      Array.from({ length: 14 }, () => reserveProcessingRequest(MONTH, "STATISTICS", BUDGET, AT)),
    );
    const proposals = await Promise.all(
      Array.from({ length: 9 }, () => reserveProcessingRequest(MONTH, "PROPOSAL", BUDGET, AT)),
    );
    const reserved = (list: string[]) => list.filter((outcome) => outcome === "reserved").length;
    // Les images ne mangent pas la part du contrôle quotidien, ni l'inverse.
    expect(reserved(images)).toBe(4);
    expect(reserved(statistics)).toBe(10);
    expect(reserved(proposals)).toBe(6);
    expect(images).toContain("share-exhausted");
    const usage = await readProcessingUsage(MONTH);
    expect([usage.imageRequests, usage.statisticsRequests, usage.proposalRequests]).toEqual([
      4, 10, 6,
    ]);
  });

  it("arrête tout le monde quand les unités de traitement du mois sont épuisées", async () => {
    expect(await reserveProcessingRequest(MONTH, "IMAGE", BUDGET, AT)).toBe("reserved");
    await addProcessingUnits(MONTH, 100);
    expect(await reserveProcessingRequest(MONTH, "STATISTICS", BUDGET, AT)).toBe("units-exhausted");
    expect(await reserveProcessingRequest(MONTH, "PROPOSAL", BUDGET, AT)).toBe("units-exhausted");
  });

  it("limite les requêtes par minute, puis repart à la minute suivante", async () => {
    const tight = { ...BUDGET, perMinute: 3 };
    const burst = await Promise.all(
      Array.from({ length: 5 }, () => reserveProcessingRequest(MONTH, "STATISTICS", tight, AT)),
    );
    expect(burst.filter((outcome) => outcome === "reserved")).toHaveLength(3);
    expect(burst).toContain("throttled");
    const nextMinute = new Date(AT.getTime() + 60_000);
    expect(await reserveProcessingRequest(MONTH, "STATISTICS", tight, nextMinute)).toBe("reserved");
  });

  it("garde une image, une zone sans donnée, et un échec pour une heure", async () => {
    const expiresAt = new Date("2099-01-03T00:00:00Z");
    await storeCachedImage("TRUE_COLOR", MONTH, "10/516/484", new Uint8Array([137, 80]), null);
    await storeCachedImage("NDVI", MONTH, "overview", null, expiresAt);
    expect(await findCachedImage("TRUE_COLOR", MONTH, "10/516/484")).toEqual({
      image: new Uint8Array([137, 80]),
      expiresAt: null,
    });
    expect(await findCachedImage("NDVI", MONTH, "overview")).toEqual({ image: null, expiresAt });
    expect(await findCachedImage("NDVI", MONTH, "10/516/484")).toBeNull();

    // Échec sans image en cache : zone vide pour une heure. Avec une image périmée : on la garde.
    const until = new Date(AT.getTime() + 3_600_000);
    await holdAfterFailure("NDVI", MONTH, "9/1/2", until);
    expect(await findCachedImage("NDVI", MONTH, "9/1/2")).toEqual({
      image: null,
      expiresAt: until,
    });
    await storeCachedImage("NDVI", MONTH, "9/1/3", new Uint8Array([1]), new Date(AT.getTime() - 1));
    await holdAfterFailure("NDVI", MONTH, "9/1/3", until);
    expect(await findCachedImage("NDVI", MONTH, "9/1/3")).toEqual({
      image: new Uint8Array([1]),
      expiresAt: until,
    });
  });
});
