import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { auth } from "@/lib/auth/auth";
import { SIGN_IN_INTENT_COOKIE, sealSignInIntent } from "@/lib/auth/sign-in-intent";
import { loadActor, provisionAccount } from "@/modules/identity";
import { getFixtureMessagingChannel } from "@/services/messaging";

// Ouverture des comptes (ADR-0013) : une inscription par la connexion ne crée qu'un compte
// d'agriculteur ; les autres rôles viennent de l'administration (provisionAccount). Canal de
// messagerie fixture (tests/integration/setup.ts), clés NPI et base semée.

const PHONES = {
  farmer: "+2290190000081",
  enrolled: "+2290190000082",
  agent: "+2290190000083",
  convert: "+2290190000084",
  other: "+2290190000085",
};
const NPIS = {
  farmer: "9876543210181",
  enrolled: "9876543210182",
  agent: "9876543210183",
  convert: "9876543210184",
  other: "9876543210185",
};
const ENROLLED_FARMER_CODE = "BJ-TEST-PROV-0001";

function intentHeaders(npi: string, phone: string): Headers {
  const value = encodeURIComponent(sealSignInIntent({ npi, phone }));
  return new Headers({ cookie: `${SIGN_IN_INTENT_COOKIE}=${value}` });
}

async function signIn(npi: string, phone: string): Promise<Response> {
  await auth.api.sendPhoneNumberOTP({
    body: { phoneNumber: phone },
    headers: intentHeaders(npi, phone),
  });
  const code = getFixtureMessagingChannel().lastOtpFor(phone);
  return auth.api.verifyPhoneNumber({
    body: { phoneNumber: phone, code: code as string },
    headers: intentHeaders(npi, phone),
    asResponse: true,
  });
}

async function rolesOf(phone: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: phone } });
  return (await loadActor(user.id)).grants.map((grant) => grant.role).sort();
}

async function cleanUp() {
  const phones = Object.values(PHONES);
  await prisma.farmer.deleteMany({ where: { code: ENROLLED_FARMER_CODE } });
  await prisma.user.deleteMany({ where: { phoneNumber: { in: phones } } });
  await prisma.rateLimit.deleteMany({
    where: { key: { in: phones.map((phone) => `otp-phone:${phone}`) } },
  });
}

describe("ouverture des comptes", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await cleanUp();
    getFixtureMessagingChannel().reset();
  }, 120_000);

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("une inscription par la connexion crée un compte d'agriculteur, et rien d'autre", async () => {
    expect((await signIn(NPIS.farmer, PHONES.farmer)).ok).toBe(true);
    expect(await rolesOf(PHONES.farmer)).toEqual(["FARMER"]);
  });

  it("relie l'inscription à la fiche producteur enregistrée par un agent avec ce numéro", async () => {
    const djougou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const farmer = await prisma.farmer.create({
      data: {
        code: ENROLLED_FARMER_CODE,
        firstName: "Awa",
        lastName: "Test",
        phoneE164: PHONES.enrolled,
        communeId: djougou.id,
        sourceId: "ATDA_TERRAIN",
        sourceDate: new Date(),
        reliability: "DECLARED",
      },
    });

    expect((await signIn(NPIS.enrolled, PHONES.enrolled)).ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONES.enrolled } });
    const linked = await prisma.farmer.findUniqueOrThrow({ where: { id: farmer.id } });
    expect(linked.userId).toBe(user.id);
    expect(user.name).toBe("Awa Test");
  });

  it("un agent ouvert par l'administration se connecte avec son seul rôle d'agent", async () => {
    const djougou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const result = await provisionAccount({
      npi: NPIS.agent,
      phone: PHONES.agent,
      role: "AGENT_AGRICULTURE",
      scopeType: "COMMUNE",
      scopeId: djougou.id,
      name: "Agent de test",
    });
    expect(result).toMatchObject({ ok: true, created: true });

    expect((await signIn(NPIS.agent, PHONES.agent)).ok).toBe(true);
    expect(await rolesOf(PHONES.agent)).toEqual(["AGENT_AGRICULTURE"]);
  });

  it("donne un rôle institutionnel à un compte inscrit et lui retire le rôle automatique", async () => {
    expect((await signIn(NPIS.convert, PHONES.convert)).ok).toBe(true);
    expect(await rolesOf(PHONES.convert)).toEqual(["FARMER"]);

    const result = await provisionAccount({
      npi: NPIS.convert,
      phone: PHONES.convert,
      role: "ADMIN_STATE",
      scopeType: "NATIONAL",
      scopeId: null,
    });
    expect(result).toMatchObject({ ok: true, created: false });
    expect(await rolesOf(PHONES.convert)).toEqual(["ADMIN_STATE"]);
  });

  it("refuse un NPI relié à un autre numéro, et un numéro relié à un autre NPI", async () => {
    const national = {
      role: "ADMIN_STATE" as const,
      scopeType: "NATIONAL" as const,
      scopeId: null,
    };
    expect(await provisionAccount({ npi: NPIS.farmer, phone: PHONES.other, ...national })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(await provisionAccount({ npi: NPIS.other, phone: PHONES.farmer, ...national })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(await prisma.user.findUnique({ where: { phoneNumber: PHONES.other } })).toBeNull();
    expect(await rolesOf(PHONES.farmer)).toEqual(["FARMER"]);
  });
});
