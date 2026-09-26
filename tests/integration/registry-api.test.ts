import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  buildReferentiel,
  getFarmDetail,
  listFarmsForActor,
  listOwnFarms,
  scopedCommuneIds,
  verificationQueue,
} from "@/modules/registry";

// Périmètre du registre tel que le voient les routes API : les fonctions de module sont appelées
// directement avec les acteurs des comptes de démonstration (agent de Djougou, agricultrice,
// analyste du ministère) et un acheteur sans périmètre territorial.

const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";

async function actorForPhone(phone: string): Promise<Actor> {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

async function actorForEmail(email: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return loadActor(user.id);
}

describe("périmètre du registre", () => {
  beforeAll(async () => {
    await seedReferenceData();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("limite l'agent de Djougou aux exploitations de sa commune", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const { items } = await listFarmsForActor(agent, { limit: 200 });
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((f) => f.commune.code))).toEqual(new Set(["BJ-DON-003"]));

    const outside = await listFarmsForActor(agent, { communeCode: "BJ-BOR-005" });
    expect(outside.items).toEqual([]);
  });

  it("ne montre à l'agricultrice que ses propres exploitations, reliées par le seed", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const user = await prisma.user.findFirstOrThrow({ where: { phoneNumber: FARMER_PHONE } });
    const own = await listOwnFarms(user.id);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((f) => f.commune.code === "BJ-DON-003")).toBe(true);

    const { items } = await listFarmsForActor(farmer, { limit: 200 });
    expect(items.map((f) => f.id).sort()).toEqual(own.map((f) => f.id).sort());
    // Le compte porte le nom du producteur relié.
    const farmerRow = await prisma.farmer.findUniqueOrThrow({ where: { userId: user.id } });
    expect(user.name).toBe(`${farmerRow.firstName} ${farmerRow.lastName}`);
  });

  it("ne renvoie rien à un acheteur et null hors périmètre", async () => {
    const buyer = await actorForEmail("acheteur@bais.demo");
    expect((await listFarmsForActor(buyer)).items).toEqual([]);
    expect(await scopedCommuneIds(buyer)).toEqual([]);

    const farmer = await actorForPhone(FARMER_PHONE);
    const elsewhere = await prisma.farm.findFirstOrThrow({
      where: { archivedAt: null, commune: { code: "BJ-BOR-005" } },
      select: { id: true },
    });
    expect(await getFarmDetail(farmer, elsewhere.id)).toBeNull();
    expect(await getFarmDetail(buyer, elsewhere.id)).toBeNull();

    const agent = await actorForPhone(AGENT_PHONE);
    // Une exploitation que l'agent a enregistrée : il ne voit que celles-là (ADR-0014).
    const inside = await prisma.farm.findFirstOrThrow({
      where: { archivedAt: null, commune: { code: "BJ-DON-003" }, registeredById: agent.userId },
      select: { id: true },
    });
    expect((await getFarmDetail(agent, inside.id))?.commune.code).toBe("BJ-DON-003");
    expect(await getFarmDetail(agent, elsewhere.id)).toBeNull();
  });

  it("ne met dans la file de vérification que des exploitations déclarées du périmètre", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const queue = await verificationQueue(agent, 100);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((f) => f.verificationStatus === "DECLARED")).toBe(true);
    expect(queue.every((f) => f.commune.code === "BJ-DON-003")).toBe(true);
  });

  it("construit le référentiel embarqué de l'agent sur sa seule commune", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const bundle = await buildReferentiel(agent);
    expect(bundle.communes.map((c) => c.code)).toEqual(["BJ-DON-003"]);
    const [djougou] = bundle.communes;
    expect(djougou?.name).toBe("Djougou");
    expect(djougou?.centroid).toHaveLength(2);
    expect(djougou?.centroid[0]).toBeGreaterThan(1);
    expect(djougou?.centroid[1]).toBeGreaterThan(9);
    expect((djougou?.geometry as { type?: string })?.type).toMatch(/Polygon/);
    expect(bundle.crops.length).toBeGreaterThan(0);
    expect(bundle.units).toHaveLength(7);
    expect(bundle.campaigns.some((c) => c.status === "OPEN")).toBe(true);
    expect(bundle.version).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("résout le périmètre en identifiants de communes : un pour l'agent, tout pour le ministère", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const ministry = await actorForEmail("ministere@bais.demo");
    const agentIds = await scopedCommuneIds(agent);
    expect(Array.isArray(agentIds) && agentIds.length === 1).toBe(true);
    const djougou = await prisma.commune.findUniqueOrThrow({
      where: { code: "BJ-DON-003" },
      select: { id: true },
    });
    expect(agentIds).toEqual([djougou.id]);
    expect(await scopedCommuneIds(ministry)).toBe("all");
    expect((await buildReferentiel(ministry, ["BJ-DON-003", "BJ-BOR-005"])).communes).toHaveLength(
      2,
    );
  });
});
