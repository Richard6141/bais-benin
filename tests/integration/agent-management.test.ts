import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import {
  createAgent,
  listAgents,
  loadActor,
  revokeAgent,
  updateAgentScope,
} from "@/modules/identity";
import { buildReferentiel, scopeKeyFor } from "@/modules/registry";

// Gestion des agents par le ministère (ADR-0013) : ouverture du compte, réaffectation, retrait,
// chaque geste au journal d'audit avec le compte du ministère ; refus pour tout autre rôle.
// Base semée : ministère +229 01 90 00 00 03, agent de Djougou +229 01 90 00 00 01.

const MINISTRY_PHONE = "+2290190000003";
const AGENT_PHONE = "+2290190000001";
const PHONES = { new: "+2290190000061", other: "+2290190000062" };
const NPIS = { new: "9876543210161", other: "9876543210162" };

async function actorForPhone(phone: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

async function communeId(code: string) {
  return (await prisma.commune.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

async function departementId(code: string) {
  return (await prisma.departement.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

async function cleanUp() {
  const users = await prisma.user.findMany({
    where: { phoneNumber: { in: Object.values(PHONES) } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await prisma.auditLog.deleteMany({ where: { resourceId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("gestion des agents par le ministère", () => {
  let ministry: Actor;
  let djougou: string;
  let copargo: string;
  let borgou: string;

  beforeAll(async () => {
    await seedReferenceData();
    await cleanUp();
    ministry = await actorForPhone(MINISTRY_PHONE);
    djougou = await communeId("BJ-DON-003");
    copargo = await communeId("BJ-DON-002");
    borgou = await departementId("BJ-BO");
  }, 180_000);

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("refuse tout rôle autre que le ministère", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    expect(await listAgents(agent)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await createAgent(agent, {
        npi: NPIS.new,
        phone: PHONES.new,
        name: "Agent refusé",
        communeIds: [djougou],
        departementIds: [],
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await prisma.user.findUnique({ where: { phoneNumber: PHONES.new } })).toBeNull();
  });

  it("ouvre le compte d'un agent sur deux communes, tracé au nom du ministère", async () => {
    const result = await createAgent(ministry, {
      npi: NPIS.new,
      phone: "01 90 00 00 61",
      name: "  Koffi   Test ",
      communeIds: [djougou, copargo],
      departementIds: [],
    });
    expect(result).toMatchObject({ ok: true, created: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONES.new } });
    expect(user.name).toBe("Koffi Test");

    const actor = await loadActor(user.id);
    expect(actor.grants.map((g) => [g.role, g.scopeType, g.scopeId]).sort()).toEqual(
      [
        ["AGENT_AGRICULTURE", "COMMUNE", copargo],
        ["AGENT_AGRICULTURE", "COMMUNE", djougou],
      ].sort(),
    );
    const assignments = await prisma.roleAssignment.findMany({ where: { userId: user.id } });
    expect(assignments.every((a) => a.grantedById === ministry.userId)).toBe(true);
    const audit = await prisma.auditLog.findMany({
      where: { action: "user.role.granted", resourceId: user.id },
    });
    expect(audit).toHaveLength(2);
    expect(audit.every((row) => row.actorId === ministry.userId)).toBe(true);

    const overview = await listAgents(ministry);
    if (!overview.ok) throw new Error("vue refusée");
    const row = overview.agents.find((agent) => agent.userId === user.id);
    expect(row?.scopes.map((s) => s.label).sort()).toEqual(["Copargo", "Djougou"]);
    expect(row?.phone).toBe("01 90 00 00 61");
    expect(row?.npi).not.toContain(NPIS.new);
  });

  it("réaffecte l'agent : le département remplace les communes, l'empreinte change", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONES.new } });
    const before = await scopeKeyFor(await loadActor(user.id));

    expect(
      await updateAgentScope(ministry, user.id, { communeIds: [], departementIds: [borgou] }),
    ).toEqual({ ok: true });
    const actor = await loadActor(user.id);
    expect(actor.grants.map((g) => [g.scopeType, g.scopeId])).toEqual([["DEPARTEMENT", borgou]]);

    const after = await scopeKeyFor(actor);
    expect(after).not.toBe(before);
    expect(after.split(",").every((code) => code.startsWith("BJ-BOR-"))).toBe(true);
    // Le référentiel téléchargé porte la même empreinte que celle donnée à l'appareil.
    expect((await buildReferentiel(actor)).scopeKey).toBe(after);

    const revoked = await prisma.auditLog.count({
      where: { action: "user.role.revoked", resourceId: user.id, actorId: ministry.userId },
    });
    expect(revoked).toBe(2);
  });

  it("refuse un périmètre vide ou un territoire inconnu", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONES.new } });
    expect(
      await updateAgentScope(ministry, user.id, { communeIds: [], departementIds: [] }),
    ).toEqual({ ok: false, code: "EMPTY_SCOPE" });
    expect(
      await updateAgentScope(ministry, user.id, {
        communeIds: ["0190a000-0000-7000-8000-000000000000"],
        departementIds: [],
      }),
    ).toEqual({ ok: false, code: "UNKNOWN_TERRITORY" });
  });

  it("refuse un numéro du ministère et un NPI déjà relié à un autre numéro", async () => {
    expect(
      await createAgent(ministry, {
        npi: NPIS.other,
        phone: MINISTRY_PHONE,
        name: "Ministère",
        communeIds: [djougou],
        departementIds: [],
      }),
    ).toEqual({ ok: false, code: "MINISTRY_ACCOUNT" });
    expect(
      await createAgent(ministry, {
        npi: NPIS.new,
        phone: PHONES.other,
        name: "Autre",
        communeIds: [djougou],
        departementIds: [],
      }),
    ).toEqual({ ok: false, code: "IDENTITY_CONFLICT" });
  });

  it("retire l'accès, puis le rend avec le même NPI et le même numéro", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONES.new } });
    expect(await revokeAgent(ministry, user.id)).toEqual({ ok: true });
    expect((await loadActor(user.id)).grants).toEqual([]);
    expect(await revokeAgent(ministry, user.id)).toEqual({ ok: false, code: "NOT_AN_AGENT" });

    const overview = await listAgents(ministry);
    if (!overview.ok) throw new Error("vue refusée");
    expect(overview.agents.some((agent) => agent.userId === user.id)).toBe(false);
    expect(overview.revoked.some((row) => row.userId === user.id)).toBe(true);

    const restored = await createAgent(ministry, {
      npi: NPIS.new,
      phone: PHONES.new,
      name: "Koffi Test",
      communeIds: [djougou],
      departementIds: [],
    });
    expect(restored).toMatchObject({ ok: true, created: false });
    expect((await loadActor(user.id)).grants.map((g) => g.scopeId)).toEqual([djougou]);
  });
});
