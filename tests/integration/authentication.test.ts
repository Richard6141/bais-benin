import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { auth } from "@/lib/auth/auth";
import { demoAccount, demoPhoneE164 } from "@/lib/auth/demo-accounts";
import { SIGN_IN_INTENT_COOKIE, sealSignInIntent } from "@/lib/auth/sign-in-intent";
import { authorize } from "@/modules/authorization";
import { grantRole, loadActor, npiSummary } from "@/modules/identity";
import { getFixtureMessagingChannel } from "@/services/messaging";

// Connexion par NPI et code (ADR-0012). Ces tests exigent MESSAGING_PRIMARY_CHANNEL=fixture
// (tests/integration/setup.ts), des clés NPI et une base migrée et semée (comptes de démo).

const PHONE = "+2290190000077";
const OTHER_PHONE = "+2290190000078";
const NPI = "9876543210123";
const OTHER_NPI = "9876543210124";

/** En-têtes d'une requête qui porte l'intention de connexion (NPI saisi au premier écran). */
function intentHeaders(npi: string, phone: string, extraCookie = ""): Headers {
  const intent = `${SIGN_IN_INTENT_COOKIE}=${encodeURIComponent(sealSignInIntent({ npi, phone }))}`;
  return new Headers({ cookie: extraCookie ? `${intent}; ${extraCookie}` : intent });
}

function cookieFromResponse(response: Response): string {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  return setCookies.map((value) => value.split(";")[0]).join("; ");
}

/** Envoi puis vérification du code reçu par le canal fixture ; renvoie la réponse brute. */
async function signIn(npi: string, phone: string): Promise<Response> {
  const channel = getFixtureMessagingChannel();
  await auth.api.sendPhoneNumberOTP({
    body: { phoneNumber: phone },
    headers: intentHeaders(npi, phone),
  });
  const code = channel.lastOtpFor(phone);
  expect(code).toMatch(/^\d{6}$/);
  return auth.api.verifyPhoneNumber({
    body: { phoneNumber: phone, code: code as string },
    headers: intentHeaders(npi, phone),
    asResponse: true,
  });
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

describe("authentification par NPI et code", () => {
  beforeAll(async () => {
    await seedReferenceData();
    // Les affectations et les sessions suivent la suppression du compte (onDelete: Cascade).
    await prisma.user.deleteMany({ where: { phoneNumber: { in: [PHONE, OTHER_PHONE] } } });
    // B4 : cette suite envoie plusieurs codes aux mêmes numéros de test ; sans repartir d'un
    // compteur propre, deux exécutions rapprochées heurteraient la limite par numéro.
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [`otp-phone:${PHONE}`, `otp-phone:${OTHER_PHONE}`] } },
    });
    getFixtureMessagingChannel().reset();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuse d'envoyer un code sans NPI saisi pour ce numéro", async () => {
    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } })).rejects.toThrow(
      /NPI/,
    );
    await expect(
      auth.api.sendPhoneNumberOTP({
        body: { phoneNumber: PHONE },
        headers: intentHeaders(NPI, OTHER_PHONE),
      }),
    ).rejects.toThrow(/NPI/);
    expect(getFixtureMessagingChannel().lastOtpFor(PHONE)).toBeUndefined();
  });

  it("crée le compte à la première connexion et y lie le NPI chiffré", async () => {
    const response = await signIn(NPI, PHONE);
    expect(response.ok).toBe(true);
    const cookie = cookieFromResponse(response);
    expect(cookie).toContain("bais.session_token");

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.phoneNumber).toBe(PHONE);
    expect(session?.user.npiStatus).toBe("PENDING");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { phoneNumber: PHONE },
      select: { id: true, npiCiphertext: true, npiIndex: true },
    });
    expect(stored.npiCiphertext?.startsWith("v1.")).toBe(true);
    expect(stored.npiCiphertext).not.toContain(NPI);
    expect(stored.npiIndex).not.toBeNull();
    expect((await npiSummary(stored.id)).masked).toBe("•••• •••• •••2 3");
  });

  it("reconnecte le même couple NPI et numéro", async () => {
    expect((await signIn(NPI, PHONE)).ok).toBe(true);
  });

  it("refuse un autre NPI pour ce numéro, même avec le bon code", async () => {
    const response = await signIn(OTHER_NPI, PHONE);
    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe("NPI_MISMATCH");
    expect(cookieFromResponse(response)).not.toContain("bais.session_token");
  });

  it("refuse de créer un compte pour un NPI déjà lié à un autre numéro", async () => {
    const response = await signIn(NPI, OTHER_PHONE);
    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe("NPI_MISMATCH");
    expect(await prisma.user.findUnique({ where: { phoneNumber: OTHER_PHONE } })).toBeNull();
  });

  it("connecte le ministère de démonstration par NPI et code, avec ses rôles", async () => {
    const ministry = demoAccount("ministere");
    const phone = demoPhoneE164(ministry);
    await auth.api.sendPhoneNumberOTP({
      body: { phoneNumber: phone },
      headers: intentHeaders(ministry.npi, phone),
    });
    const response = await auth.api.verifyPhoneNumber({
      body: { phoneNumber: phone, code: process.env.OTP_DEMO_CODE ?? "246810" },
      headers: intentHeaders(ministry.npi, phone),
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieFromResponse(response) }),
    });
    const actor = await loadActor(session!.user.id);
    expect(actor.grants.map((g) => g.role)).toContain("ADMIN_STATE");
    expect(authorize(actor, "analytics.read").allowed).toBe(true);
    expect(authorize(actor, "farm.create", { communeId: "x" }).allowed).toBe(false);
  });

  it("n'accepte plus de connexion par mot de passe", async () => {
    await expect(
      auth.api.signInEmail({ body: { email: "ministere@bais.demo", password: "x".repeat(12) } }),
    ).rejects.toThrow();
  });

  it("limite l'agent de démonstration à ce qu'il a enregistré (ADR-0014), pas à toute sa commune", async () => {
    const agent = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: "+2290190000001" } });
    const djougou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const actor = await loadActor(agent.id);
    // Enregistrée par lui : autorisé, même identifiant de commune que ci-dessous.
    expect(
      authorize(actor, "farm.verify", { communeId: djougou.id, registeredByUserId: agent.id })
        .allowed,
    ).toBe(true);
    // Même commune, mais enregistrée par quelqu'un d'autre : refusé.
    expect(
      authorize(actor, "farm.verify", { communeId: djougou.id, registeredByUserId: "someone-else" })
        .allowed,
    ).toBe(false);
    // farm.create reste territorial : c'est là où il a le droit d'enregistrer, pas ce qu'il revoit.
    expect(authorize(actor, "farm.create", { communeId: djougou.id }).allowed).toBe(true);
    expect(authorize(actor, "user.npi.reveal", { ownerUserId: agent.id }).allowed).toBe(false);
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
