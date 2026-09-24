import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { DEMO_PASSWORD } from "@/database/seed/steps/accounts.seed";
import { auth } from "@/lib/auth/auth";
import { authorize } from "@/modules/authorization";
import { attachNpi, grantRole, loadActor, npiSummary } from "@/modules/identity";
import { getFixtureMessagingChannel } from "@/services/messaging";

// Ces tests exigent MESSAGING_PRIMARY_CHANNEL=fixture (tests/integration/setup.ts),
// des clés NPI et une base migrée. Le seed est idempotent.

const PHONE = "+2290190000077";

async function sessionHeadersFor(cookieHeader: string) {
  return new Headers({ cookie: cookieHeader });
}

function cookieFromResponse(response: Response): string {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  return setCookies.map((value) => value.split(";")[0]).join("; ");
}

describe("authentification", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await prisma.user.deleteMany({ where: { phoneNumber: PHONE } });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connecte un nouveau numéro par code à usage unique et crée le compte", async () => {
    const channel = getFixtureMessagingChannel();
    channel.reset();

    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const code = channel.lastOtpFor(PHONE);
    expect(code).toMatch(/^\d{6}$/);

    const response = await auth.api.verifyPhoneNumber({
      body: { phoneNumber: PHONE, code: code as string },
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    const cookie = cookieFromResponse(response);
    expect(cookie).toContain("bais.session_token");

    const session = await auth.api.getSession({ headers: await sessionHeadersFor(cookie) });
    expect(session?.user.phoneNumber).toBe(PHONE);
    expect(session?.user.email).toBe("2290190000077@telephone.bais.invalid");
  });

  it("refuse un code erroné et un numéro non béninois", async () => {
    const channel = getFixtureMessagingChannel();
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    expect(channel.lastOtpFor(PHONE)).toBeDefined();

    await expect(
      auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: "000000" } }),
    ).rejects.toThrow();

    await expect(
      auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+33612345678" } }),
    ).rejects.toThrow();
  });

  it("connecte un compte institutionnel par mot de passe et applique ses rôles", async () => {
    const response = await auth.api.signInEmail({
      body: { email: "ministere@bais.demo", password: DEMO_PASSWORD },
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    const session = await auth.api.getSession({
      headers: await sessionHeadersFor(cookieFromResponse(response)),
    });
    expect(session).not.toBeNull();

    const actor = await loadActor(session!.user.id);
    expect(actor.grants.map((g) => g.role)).toContain("ADMIN_STATE");
    expect(authorize(actor, "analytics.read").allowed).toBe(true);
    expect(authorize(actor, "farm.create", { communeId: "x" }).allowed).toBe(false);
  });

  it("refuse un mauvais mot de passe sans révéler l'existence du compte", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: "ministere@bais.demo", password: "faux-mot-de-passe" },
      }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email: "inconnu@bais.demo", password: "faux-mot-de-passe" } }),
    ).rejects.toThrow();
  });

  it("limite l'agent de démonstration à sa commune", async () => {
    const agent = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: "+2290190000001" } });
    const djougou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const parakou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-BOR-005" } });
    const actor = await loadActor(agent.id);
    expect(authorize(actor, "farm.verify", { communeId: djougou.id }).allowed).toBe(true);
    expect(authorize(actor, "farm.verify", { communeId: parakou.id }).allowed).toBe(false);
    expect(authorize(actor, "user.npi.reveal", { ownerUserId: agent.id }).allowed).toBe(false);
  });

  it("rattache un NPI chiffré, unique, en attente de vérification", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONE } });
    const npi = "9876543210123";
    const result = await attachNpi({ userId: user.id, npi, lastName: "Test" });
    expect(result).toMatchObject({ ok: true, status: "PENDING" });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { npiCiphertext: true, npiIndex: true, npiStatus: true },
    });
    expect(stored.npiCiphertext?.startsWith("v1.")).toBe(true);
    expect(stored.npiCiphertext).not.toContain(npi);
    expect(stored.npiIndex).not.toBeNull();

    const summary = await npiSummary(user.id);
    expect(summary.masked).toBe("•••• •••• •••2 3");

    // Le même NPI sur un autre compte est refusé grâce à l'index aveugle.
    const other = await prisma.user.findUniqueOrThrow({ where: { email: "acheteur@bais.demo" } });
    const duplicate = await attachNpi({ userId: other.id, npi, lastName: "Autre" });
    expect(duplicate).toMatchObject({ ok: false });

    const bad = await attachNpi({ userId: user.id, npi: "123", lastName: "Test" });
    expect(bad.ok).toBe(false);
  });

  it("journalise les attributions de rôle", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: PHONE } });
    await grantRole({ userId: user.id, role: "FARMER", scopeType: "SELF" });
    const entries = await prisma.auditLog.findMany({
      where: { action: "user.role.granted", resourceId: user.id },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});
