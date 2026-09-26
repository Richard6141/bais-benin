import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { AnalyticsError, getHarvestForecast } from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";

// Prévision des récoltes (ADR-0020) sur le registre de démonstration : campagne ouverte prévue à
// partir des deux campagnes closes semées par le seed.

let ministry: Actor;
let agent: Actor;

describe("prévision des récoltes", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    ministry = await loadActor(ministryUser.id);
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000001" },
    });
    agent = await loadActor(agentUser.id);
  }, 240_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prévoit chaque culture de la campagne ouverte, comparée à la précédente", async () => {
    const forecast = await getHarvestForecast(ministry);
    expect(forecast.campaign.status).toBe("OPEN");
    expect(forecast.historyCampaigns).toHaveLength(2);
    expect(forecast.rows.length).toBeGreaterThan(5);
    for (const row of forecast.rows) {
      expect(row.productionT).toBeGreaterThan(0);
      expect(row.lowT).toBeLessThanOrEqual(row.productionT);
      expect(row.highT).toBeGreaterThanOrEqual(row.productionT);
    }
    const maize = forecast.rows.find((r) => r.code === "MAIZE");
    expect(maize?.previousT).not.toBeNull();
    // Rendement de référence plausible : entre la moitié et le double du rendement type (1,35 t/ha).
    expect(maize!.productionT / maize!.areaHa).toBeGreaterThan(0.6);
    expect(maize!.productionT / maize!.areaHa).toBeLessThan(2.7);
  });

  it("détaille une culture par département", async () => {
    const forecast = await getHarvestForecast(ministry, { cropCode: "COTTON" });
    expect(forecast.cropCode).toBe("COTTON");
    expect(forecast.cropName).toBe("Coton");
    expect(forecast.rows.every((r) => r.code.startsWith("BJ-"))).toBe(true);
  });

  it("est réservée au ministère", async () => {
    await expect(getHarvestForecast(agent)).rejects.toBeInstanceOf(AnalyticsError);
  });
});
