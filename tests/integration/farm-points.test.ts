import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import { farmPointsOf, listFarmsForActor } from "@/modules/registry";

// Mini-carte de la liste des exploitations de l'agent : les positions ne sont lues que pour les
// exploitations de la page, déjà filtrées par le périmètre de l'agent.

const AGENT_PHONE = "+2290190000001";

describe("positions des exploitations listées", () => {
  beforeAll(async () => {
    await seedReferenceData();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ne renvoie que les exploitations demandées, avec des coordonnées au Bénin", async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: AGENT_PHONE },
      select: { id: true },
    });
    const agent = await loadActor(user.id);
    const page = await listFarmsForActor(agent, { limit: 25 });
    expect(page.items.length).toBeGreaterThan(0);

    const points = await farmPointsOf(page.items);
    const listed = new Set(page.items.map((farm) => farm.id));
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(listed.has(point.id)).toBe(true);
      expect(point.lng).toBeGreaterThan(0.5);
      expect(point.lng).toBeLessThan(4.1);
      expect(point.lat).toBeGreaterThan(6);
      expect(point.lat).toBeLessThan(12.5);
    }
  });

  it("ne lit rien pour une liste vide", async () => {
    expect(await farmPointsOf([])).toEqual([]);
  });
});
