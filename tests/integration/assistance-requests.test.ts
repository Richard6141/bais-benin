import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import {
  assistanceStats,
  listAssistanceForActor,
  resolveRequest,
  takeChargeOfRequest,
} from "@/modules/assistance";
import { loadActor } from "@/modules/identity";
import { applySyncBatch } from "@/modules/sync";

// « Solliciter l'État » (phase 0) : la demande du producteur arrive aux agents de sa commune,
// qui la prennent en charge puis la résolvent ; le producteur suit le statut ; le ministère ne
// voit que les agrégats par commune, masqués sous 5 demandes.

const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";
const DEVICE = "test-device-assistance";
const AT = "2026-09-26T09:00:00+01:00";
const ids = {
  withFarm: "019284a0-0000-7000-8000-0000000f0001",
  withoutFarm: "019284a0-0000-7000-8000-0000000f0002",
  byAgent: "019284a0-0000-7000-8000-0000000f0003",
  capped: "019284a0-0000-7000-8000-0000000f0004",
  elsewhere: "019284a0-0000-7000-8000-0000000f0005",
};
const filler: string[] = [];

function command(id: string, payload: unknown) {
  return {
    id,
    type: "assistance.request",
    payload,
    idempotencyKey: `asst-${id}`,
    clientCreatedAt: AT,
    deviceId: DEVICE,
  };
}

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({ where: { phoneNumber: phone } });
  return loadActor(user.id);
}

describe("demandes d'assistance", () => {
  beforeAll(async () => {
    await seedReferenceData();
  }, 180_000);

  afterAll(async () => {
    await prisma.farmerNotification.deleteMany({
      where: { subjectId: { in: Object.values(ids) } },
    });
    await prisma.assistanceRequest.deleteMany({
      where: { id: { in: [...Object.values(ids), ...filler] } },
    });
    await prisma.farmEvent.deleteMany({ where: { kind: "ASSISTANCE_REQUESTED" } });
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.$disconnect();
  });

  it("reçoit la demande du producteur, avec ou sans exploitation, jamais celle d'un agent", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const agent = await actorForPhone(AGENT_PHONE);
    const farm = await prisma.farm.findFirstOrThrow({
      where: { farmer: { userId: farmer.userId }, archivedAt: null },
      select: { id: true },
    });
    const results = await applySyncBatch(farmer, DEVICE, [
      command(ids.withFarm, {
        id: ids.withFarm,
        category: "INPUT",
        description: "Je n'ai pas reçu les semences de maïs promises",
        farmId: farm.id,
        requestedAt: AT,
      }),
      command(ids.withoutFarm, {
        id: ids.withoutFarm,
        category: "ADVICE",
        description: "Quand semer le niébé cette année ?",
        communeCode: "BJ-DON-003",
        requestedAt: AT,
      }),
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["APPLIED", "APPLIED"]);

    const [fromAgent] = await applySyncBatch(agent, DEVICE, [
      command(ids.byAgent, {
        id: ids.byAgent,
        category: "OTHER",
        description: "Demande déposée par un agent",
        communeCode: "BJ-DON-003",
        requestedAt: AT,
      }),
    ]);
    expect(fromAgent).toMatchObject({ outcome: "REJECTED", error: { code: "FORBIDDEN" } });
  });

  it("montre la demande aux agents de la commune, avec le contact du producteur", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const farmer = await actorForPhone(FARMER_PHONE);
    const forAgent = await listAssistanceForActor(agent);
    const request = forAgent.find((r) => r.id === ids.withFarm);
    expect(request).toMatchObject({ status: "RECEIVED", requesterPhone: FARMER_PHONE });
    expect(forAgent.map((r) => r.id)).toContain(ids.withoutFarm);

    const forFarmer = await listAssistanceForActor(farmer);
    expect(forFarmer.map((r) => r.id)).toEqual(
      expect.arrayContaining([ids.withFarm, ids.withoutFarm]),
    );
    // Le producteur ne voit pas son propre numéro comme « contact ».
    expect(forFarmer.find((r) => r.id === ids.withFarm)?.requesterPhone).toBeNull();
  });

  it("suit la demande de la réception à la résolution", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const farmer = await actorForPhone(FARMER_PHONE);
    expect(await takeChargeOfRequest(farmer, ids.withFarm)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await takeChargeOfRequest(agent, ids.withFarm)).toMatchObject({ ok: true });
    expect(await takeChargeOfRequest(agent, ids.withFarm)).toEqual({
      ok: false,
      code: "INVALID_STATE",
    });
    expect(await resolveRequest(agent, ids.withFarm, "ok")).toEqual({
      ok: false,
      code: "NOTE_REQUIRED",
    });
    expect(
      await resolveRequest(agent, ids.withFarm, "Semences livrées au magasin de Djougou lundi"),
    ).toMatchObject({ ok: true });
    // Résolue directement, sans étape « en cours ».
    expect(
      await resolveRequest(agent, ids.withoutFarm, "Semez dès les premières pluies"),
    ).toMatchObject({ ok: true });

    const [resolved] = (await listAssistanceForActor(farmer)).filter((r) => r.id === ids.withFarm);
    expect(resolved).toMatchObject({
      status: "RESOLVED",
      resolutionNote: "Semences livrées au magasin de Djougou lundi",
    });
    expect(resolved?.takenAt).not.toBeNull();
    expect(resolved?.handledByName).toBeTruthy();
  });

  it("ne donne au ministère que des agrégats masqués sous 5 demandes", async () => {
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    const ministry = await loadActor(ministryUser.id);
    expect(await listAssistanceForActor(ministry)).toEqual([]);

    const stats = await assistanceStats(ministry);
    const djougou = stats.communes.find((c) => c.communeCode === "BJ-DON-003");
    const count = await prisma.assistanceRequest.count({
      where: { commune: { code: "BJ-DON-003" } },
    });
    if (count < 5) {
      expect(djougou).toMatchObject({ masked: true, total: null, medianHoursToTake: null });
    } else {
      expect(djougou?.masked).toBe(false);
    }
    expect(stats.total.requests).toBeGreaterThanOrEqual(2);
  });

  it("envoie une demande sans exploitation à la commune de la fiche producteur", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const [result] = await applySyncBatch(farmer, DEVICE, [
      command(ids.elsewhere, {
        id: ids.elsewhere,
        category: "ADVICE",
        description: "Demande adressée à une autre commune",
        communeCode: "BJ-BOR-005",
        requestedAt: AT,
      }),
    ]);
    expect(result?.outcome).toBe("APPLIED");
    const stored = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { id: ids.elsewhere },
      select: { commune: { select: { code: true } } },
    });
    expect(stored.commune.code).toBe("BJ-DON-003");
  });

  it("plafonne les demandes d'un compte sur 24 heures", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const commune = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const already = await prisma.assistanceRequest.count({
      where: { requesterId: farmer.userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    filler.push(...Array.from({ length: Math.max(0, 10 - already) }, () => crypto.randomUUID()));
    await prisma.assistanceRequest.createMany({
      data: filler.map((id) => ({
        id,
        requesterId: farmer.userId,
        communeId: commune.id,
        category: "OTHER" as const,
        description: "Demande de remplissage du plafond",
      })),
    });
    const [capped] = await applySyncBatch(farmer, DEVICE, [
      command(ids.capped, {
        id: ids.capped,
        category: "ADVICE",
        description: "Une demande de trop dans la journée",
        communeCode: "BJ-DON-003",
        requestedAt: AT,
      }),
    ]);
    expect(capped).toMatchObject({ outcome: "REJECTED", error: { code: "RATE_LIMITED" } });
  });
});
