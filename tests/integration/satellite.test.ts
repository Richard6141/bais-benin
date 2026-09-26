import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  addProcessingUnits,
  findCachedImage,
  readProcessingUsage,
  reserveProcessingRequest,
  storeCachedImage,
} from "@/database/sql/satellite.sql";

// Vue du ciel (ADR-0016) : garde-fou du quota Copernicus et cache des images, sur la vraie base.
// Mois fictif, isolé des mois réels et retiré après la suite.
const MONTH = "2099-01";

async function clean() {
  await prisma.satelliteTile.deleteMany({ where: { period: MONTH } });
  await prisma.satelliteUsage.deleteMany({ where: { month: MONTH } });
}

describe("imagerie satellite en base", () => {
  beforeAll(clean);
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("refuse toute requête de traitement au-delà du plafond mensuel, même concurrente", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        reserveProcessingRequest(MONTH, index % 2 === 0 ? "IMAGE" : "STATISTICS", 4),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(4);
    await addProcessingUnits(MONTH, 2.5);
    const usage = await readProcessingUsage(MONTH);
    expect(usage.imageRequests + usage.statisticsRequests).toBe(4);
    expect(usage.processingUnits).toBeCloseTo(2.5);
    expect(await reserveProcessingRequest(MONTH, "IMAGE", 0)).toBe(false);
  });

  it("garde une image et une zone sans donnée, avec ou sans échéance", async () => {
    const expiresAt = new Date("2099-01-03T00:00:00Z");
    await storeCachedImage("TRUE_COLOR", MONTH, "10/516/484", new Uint8Array([137, 80]), null);
    await storeCachedImage("NDVI", MONTH, "overview", null, expiresAt);
    expect(await findCachedImage("TRUE_COLOR", MONTH, "10/516/484")).toEqual({
      image: new Uint8Array([137, 80]),
      expiresAt: null,
    });
    expect(await findCachedImage("NDVI", MONTH, "overview")).toEqual({ image: null, expiresAt });
    expect(await findCachedImage("NDVI", MONTH, "10/516/484")).toBeNull();
  });
});
