import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import { WatchAccessError, getWatchSummary } from "@/modules/watch";

// Centre de veille (ADR-0022) : une synthèse nationale réservée au ministère, sans aucune donnée
// nominative d'une demande d'assistance.

async function actorFor(where: { phoneNumber?: string; email?: string }) {
  const user = await prisma.user.findFirstOrThrow({ where, select: { id: true } });
  return loadActor(user.id);
}

describe("centre de veille", () => {
  beforeAll(async () => {
    await seedReferenceData();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("résume feux, alertes, foyers, demandes et fraîcheur pour le ministère", async () => {
    const summary = await getWatchSummary(await actorFor({ email: "ministere@bais.demo" }));
    expect(summary.fires.last24h).toBeGreaterThanOrEqual(0);
    expect(summary.alerts.active).toBe(
      Object.values(summary.alerts.bySeverity).reduce((sum, count) => sum + count, 0),
    );
    expect(summary.heldOutbreaks.length).toBeLessThanOrEqual(summary.alerts.active);
    expect(summary.fires.last7d).toBeGreaterThanOrEqual(summary.fires.last24h);
    expect(Array.isArray(summary.exposure["24h"])).toBe(true);
    expect(Array.isArray(summary.exposure["7d"])).toBe(true);
    expect(summary.reportGroups.every((group) => group.reports >= 2)).toBe(true);
    expect(summary.freshness.map((source) => source.source)).toEqual([
      "Feux actifs (NASA FIRMS)",
      "Météo (Open-Meteo)",
      "Agrégats du tableau de bord",
    ]);
    // Des volumes, jamais une demande : ni description, ni demandeur, ni numéro.
    expect(Object.keys(summary.assistance).sort()).toEqual([
      "received24h",
      "received7d",
      "resolved7d",
      "waiting",
    ]);
  });

  it("est refusé à un agent", async () => {
    const agent = await actorFor({ phoneNumber: "+2290190000001" });
    await expect(getWatchSummary(agent)).rejects.toBeInstanceOf(WatchAccessError);
  });
});
