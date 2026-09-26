import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { liveContext, readActivity } from "@/modules/live";

// Fil d'activité en direct : le ministère voit tout le pays, l'agent seulement les exploitations
// qu'il a enregistrées (ADR-0014), le producteur n'a pas de fil. Deux événements d'exploitation
// sont créés pour le test, puis retirés.

let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let agentFarmId: string;
let otherFarmId: string;
const createdIds: string[] = [];

describe("fil d'activité en direct", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const [ministryUser, agentUser, farmerUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "ministere@bais.demo" } }),
      prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000001" } }),
      prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000002" } }),
    ]);
    [ministry, agent, farmer] = await Promise.all([
      loadActor(ministryUser.id),
      loadActor(agentUser.id),
      loadActor(farmerUser.id),
    ]);
    agentFarmId = (
      await prisma.farm.findFirstOrThrow({
        where: { registeredById: agentUser.id, archivedAt: null },
        select: { id: true },
      })
    ).id;
    otherFarmId = (
      await prisma.farm.findFirstOrThrow({
        where: { registeredById: null, archivedAt: null, commune: { code: "BJ-BOR-008" } },
        select: { id: true },
      })
    ).id;
    // Saisis hors ligne la veille, arrivés maintenant : le fil lit l'arrivée, pas la saisie.
    const yesterday = new Date(Date.now() - 24 * 3600_000);
    for (const farmId of [agentFarmId, otherFarmId]) {
      const event = await prisma.farmEvent.create({
        data: { farmId, kind: "HARVEST_DECLARED", occurredAt: yesterday },
        select: { id: true },
      });
      createdIds.push(event.id);
    }
  }, 240_000);

  afterAll(async () => {
    await prisma.farmEvent.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("montre tout le pays au ministère, y compris un fait saisi hors ligne la veille", async () => {
    const context = await liveContext(ministry);
    expect(context?.audience).toBe("MINISTRY");
    const items = await readActivity(context!, new Date(Date.now() - 60_000));
    const ids = items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(createdIds));
    const mine = items.find((item) => item.id === createdIds[0]);
    expect(mine).toMatchObject({ kind: "farm.HARVEST_DECLARED" });
    expect(JSON.stringify(items)).not.toMatch(/firstName|lastName|phone/i);
  });

  it("ne montre à l'agent que ses propres exploitations", async () => {
    const context = await liveContext(agent);
    expect(context?.audience).toBe("AGENT");
    const items = await readActivity(context!, new Date(Date.now() - 60_000));
    const ids = items.map((item) => item.id);
    expect(ids).toContain(createdIds[0]);
    expect(ids).not.toContain(createdIds[1]);
    expect(items.find((item) => item.id === createdIds[0])?.href).toBe(
      `/agent/exploitations/${agentFarmId}`,
    );
  });

  it("n'ouvre pas de fil au producteur", async () => {
    await expect(liveContext(farmer)).resolves.toBeNull();
  });
});
