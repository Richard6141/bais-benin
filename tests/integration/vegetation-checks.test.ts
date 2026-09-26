import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  getFarmVegetationChecks,
  getVegetationSummary,
  listFlaggedFarms,
  runVegetationChecks,
} from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Confrontation déclaration / satellite (ADR-0016) sur la vraie base : qui voit quels verdicts.
// Appuyé sur les comptes de démonstration semés ; les verdicts manquants sont calculés avec la
// fixture (séries synthétiques, sans réseau), les exploitations enregistrées par un agent d'abord.

const AGENT_PHONE = "+2290190000001";
const MINISTRY_PHONE = "+2290190000003";

async function actorForPhone(phone: string): Promise<{ id: string; actor: Actor }> {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

describe("confrontation déclaration / satellite", () => {
  beforeAll(async () => {
    await runVegetationChecks({ provider: createFixtureRemoteSensingProvider(), limit: 60 });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("donne la synthèse nationale au ministère, jamais à un agent", async () => {
    const ministry = await actorForPhone(MINISTRY_PHONE);
    const agent = await actorForPhone(AGENT_PHONE);
    const summary = await getVegetationSummary(ministry.actor);
    expect(summary?.byStatus.length).toBeGreaterThan(0);
    expect(await getVegetationSummary(agent.actor)).toBeNull();
  });

  it("ne montre à l'agent que les exploitations qu'il a enregistrées (ADR-0014)", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const flagged = await listFlaggedFarms(agent.actor);
    const farms = await prisma.farm.findMany({
      where: { id: { in: flagged.map((farm) => farm.farm_id) } },
      select: { registeredById: true },
    });
    expect(farms.every((farm) => farm.registeredById === agent.id)).toBe(true);

    const own = await prisma.farm.findFirst({
      where: { registeredById: agent.id, parcels: { some: { vegetationChecks: { some: {} } } } },
      select: { id: true },
    });
    const other = await prisma.farm.findFirst({
      where: {
        OR: [{ registeredById: null }, { registeredById: { not: agent.id } }],
        parcels: { some: { vegetationChecks: { some: {} } } },
      },
      select: { id: true },
    });
    expect(own).not.toBeNull();
    expect(other).not.toBeNull();
    expect((await getFarmVegetationChecks(agent.actor, own!.id)).length).toBeGreaterThan(0);
    expect(await getFarmVegetationChecks(agent.actor, other!.id)).toEqual([]);

    const ministry = await actorForPhone(MINISTRY_PHONE);
    expect((await getFarmVegetationChecks(ministry.actor, other!.id)).length).toBeGreaterThan(0);
  });
});
