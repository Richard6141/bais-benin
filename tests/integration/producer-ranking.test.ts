import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import {
  AnalyticsError,
  MIN_AREA_FOR_YIELD_HA,
  exportProducerRankingCsv,
  getProducerRanking,
} from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";

// Palmarès des producteurs (ADR-0018) sur le registre de démonstration, dont l'historique de
// récoltes est semé sur les deux dernières campagnes closes. Les entrées d'audit créées ici sont
// retirées à la fin.

const since = new Date();
let ministry: Actor;
let agent: Actor;

describe("palmarès des producteurs", () => {
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
    await prisma.auditLog.deleteMany({
      where: {
        action: { in: ["analytics.ranking.read", "analytics.ranking.export"] },
        occurredAt: { gte: since },
      },
    });
    await prisma.$disconnect();
  });

  it("classe les producteurs de coton vérifiés par production décroissante", async () => {
    const ranking = await getProducerRanking(ministry, { cropCode: "COTTON", limit: "20" });
    expect(ranking.campaign.status).toBe("CLOSED");
    expect(ranking.rows.length).toBeGreaterThan(0);
    expect(ranking.rows.length).toBeLessThanOrEqual(20);
    expect(ranking.eligibleCount).toBeGreaterThanOrEqual(ranking.rows.length);
    expect(ranking.rows.map((r) => r.rank)).toEqual(ranking.rows.map((_, i) => i + 1));
    for (let i = 1; i < ranking.rows.length; i += 1) {
      expect(ranking.rows[i - 1]!.productionT).toBeGreaterThanOrEqual(ranking.rows[i]!.productionT);
    }
    expect(ranking.rows.every((r) => r.verified)).toBe(true);
    // Le ministère a le droit de lire les contacts : le téléphone sert à joindre les lauréats.
    expect(ranking.rows.some((r) => r.phone !== null)).toBe(true);
  });

  it("élargit aux exploitations non vérifiées sur demande explicite", async () => {
    const verified = await getProducerRanking(ministry, { cropCode: "MAIZE", limit: "10" });
    const all = await getProducerRanking(ministry, {
      cropCode: "MAIZE",
      limit: "10",
      verifiedOnly: "0",
    });
    expect(all.eligibleCount).toBeGreaterThan(verified.eligibleCount);
  });

  it("classe au rendement sans les micro-parcelles", async () => {
    const ranking = await getProducerRanking(ministry, {
      cropCode: "MAIZE",
      metric: "yield",
      limit: "30",
    });
    expect(ranking.rows.length).toBeGreaterThan(0);
    expect(ranking.rows.every((r) => r.areaHa >= MIN_AREA_FOR_YIELD_HA)).toBe(true);
    for (let i = 1; i < ranking.rows.length; i += 1) {
      expect(ranking.rows[i - 1]!.yieldTPerHa!).toBeGreaterThanOrEqual(
        ranking.rows[i]!.yieldTPerHa!,
      );
    }
  });

  it("filtre par département et par campagne", async () => {
    const departement = await prisma.departement.findFirstOrThrow({ where: { code: "BJ-BO" } });
    const campaigns = await prisma.agriculturalCampaign.findMany({
      where: { status: "CLOSED" },
      orderBy: { startYear: "asc" },
    });
    const older = campaigns.at(-2)!;
    const ranking = await getProducerRanking(ministry, {
      cropCode: "COTTON",
      campaignCode: older.code,
      departementCode: departement.code,
    });
    expect(ranking.filters.campaignCode).toBe(older.code);
    expect(ranking.rows.length).toBeGreaterThan(0);
    expect(ranking.rows.every((r) => r.departementName === departement.name)).toBe(true);
  });

  it("est refusé à un agent, et chaque consultation est journalisée", async () => {
    await expect(getProducerRanking(agent, { cropCode: "COTTON" })).rejects.toBeInstanceOf(
      AnalyticsError,
    );
    await getProducerRanking(ministry, { cropCode: "RICE", limit: "5" });
    const entry = await prisma.auditLog.findFirst({
      where: { action: "analytics.ranking.read", occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
    });
    expect(entry?.actorId).toBe(ministry.userId);
  });

  it("exporte le même classement en CSV lisible par Excel", async () => {
    const ranking = await getProducerRanking(ministry, { cropCode: "COTTON", limit: "10" });
    const file = await exportProducerRankingCsv(ministry, { cropCode: "COTTON", limit: "10" });
    expect(file.filename).toBe(`palmares-cotton-${ranking.filters.campaignCode}.csv`);
    const lines = file.content.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("rang;code_producteur;producteur");
    expect(lines).toHaveLength(ranking.rows.length + 1);
    expect(lines[1]).toContain(ranking.rows[0]!.farmerCode);
    await expect(exportProducerRankingCsv(agent, {})).rejects.toBeInstanceOf(AnalyticsError);
  });
});
