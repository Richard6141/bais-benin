import type { PrismaClient } from "@/generated/prisma/client";
import { demoAccount, demoPhoneE164 } from "@/lib/auth/demo-accounts";
import { encryptNpi, keyringFromEnv, npiBlindIndex } from "@/lib/crypto/npi";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

// Comptes de démonstration (ADR-0012). Chaque rôle a un NPI et un numéro fictifs
// (lib/auth/demo-accounts.ts) et se connecte comme tout le monde : NPI et numéro, puis code.
// Le code OTP_DEMO_CODE n'est accepté que pour ces numéros-là (isDemoPhone). Rien de tout cela
// n'existe en production : lib/env.ts interdit OTP_DEMO_CODE hors développement, et
// seedDemoAccounts (A4) refuse de créer le moindre compte si APP_ENV=production, même si la
// commande de seed est lancée par erreur.

export interface DemoAccount {
  key: string;
  name: string;
  email: string;
  role: "ADMIN_STATE" | "AGENT_AGRICULTURE" | "FARMER" | "COOPERATIVE" | "BUYER";
  scope: { type: "NATIONAL" | "COMMUNE" | "SELF" | "ORGANIZATION"; communeCode?: string };
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "ministere",
    name: "Analyste du ministère (démonstration)",
    email: "ministere@bais.demo",
    role: "ADMIN_STATE",
    scope: { type: "NATIONAL" },
  },
  {
    key: "agent-djougou",
    name: "Agent de terrain, Djougou (démonstration)",
    email: "+2290190000001@telephone.bais.invalid",
    role: "AGENT_AGRICULTURE",
    scope: { type: "COMMUNE", communeCode: "BJ-DON-003" },
  },
  {
    key: "agricultrice-djougou",
    name: "Agricultrice, Djougou (démonstration)",
    email: "+2290190000002@telephone.bais.invalid",
    role: "FARMER",
    scope: { type: "SELF" },
  },
  {
    key: "cooperative",
    name: "Gestionnaire de coopérative (démonstration)",
    email: "cooperative@bais.demo",
    role: "COOPERATIVE",
    scope: { type: "SELF" },
  },
  {
    key: "acheteur",
    name: "Acheteur (démonstration)",
    email: "acheteur@bais.demo",
    role: "BUYER",
    scope: { type: "SELF" },
  },
];

export async function seedDemoAccounts(prisma: PrismaClient): Promise<number> {
  // A4 : filet de sécurité définitif — aucun compte de démonstration n'est créé en
  // production, quelle que soit la façon dont le seed a été déclenché.
  const env = getServerEnv();
  if (env.APP_ENV === "production") return 0;
  const keyring = keyringFromEnv(env);
  if (!keyring) {
    logger.warn(
      "NPI_ENCRYPTION_KEY ou NPI_HASH_KEY absent : comptes de démonstration créés sans NPI, " +
        "impossible de s'y connecter",
    );
  }

  for (const account of DEMO_ACCOUNTS) {
    const { npi } = demoAccount(account.key);
    const phone = demoPhoneE164(demoAccount(account.key));
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        name: account.name,
        email: account.email,
        emailVerified: false,
        phoneNumber: phone,
        phoneNumberVerified: true,
        status: "ACTIVE",
      },
      update: {
        name: account.name,
        status: "ACTIVE",
        phoneNumber: phone,
        phoneNumberVerified: true,
      },
      select: { id: true },
    });
    if (keyring) {
      const context = { table: "user", column: "npi_ciphertext", recordId: user.id };
      await prisma.user.update({
        where: { id: user.id },
        data: {
          npiIndex: Uint8Array.from(npiBlindIndex(npi, keyring)),
          npiCiphertext: encryptNpi(npi, context, keyring),
          npiStatus: "PENDING",
          npiVerificationProvider: "anip-local",
        },
      });
    }
    // Plus de mot de passe (ADR-0012) : les anciens identifiants de démonstration sont retirés.
    await prisma.account.deleteMany({ where: { userId: user.id, providerId: "credential" } });

    let scopeId: string | null = null;
    if (account.scope.type === "COMMUNE" && account.scope.communeCode) {
      const commune = await prisma.commune.findUniqueOrThrow({
        where: { code: account.scope.communeCode },
        select: { id: true },
      });
      scopeId = commune.id;
    }
    const existingRole = await prisma.roleAssignment.findFirst({
      where: {
        userId: user.id,
        role: account.role,
        scopeType: account.scope.type,
        scopeId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!existingRole) {
      await prisma.roleAssignment.create({
        data: { userId: user.id, role: account.role, scopeType: account.scope.type, scopeId },
      });
    }
  }

  return DEMO_ACCOUNTS.length;
}

export const DEMO_FARMER_PHONE = "+2290190000002";
export const DEMO_FARMER_COMMUNE_CODE = "BJ-DON-003";

// Rattache le compte agricultrice de démonstration à une exploitation synthétique de Djougou,
// choisie de façon déterministe (première par code) parmi celles qui ont au moins une culture
// déclarée pour la campagne ouverte : « Déclarer ma récolte » a ainsi toujours quelque chose à
// proposer. Idempotent : si le compte est déjà relié à une exploitation de la commune, rien ne
// change ; après SEED_FARM_RESET, le rattachement est refait sur le nouveau registre. Le nom du
// compte prend celui du producteur pour que l'espace agriculteur soit cohérent.
export async function attachDemoFarmerAccount(prisma: PrismaClient): Promise<boolean> {
  // A4 : même filet qu'au-dessus, par défense en profondeur.
  if (getServerEnv().APP_ENV === "production") return false;

  const user = await prisma.user.findUnique({
    where: { phoneNumber: DEMO_FARMER_PHONE },
    select: { id: true },
  });
  if (!user) return false;

  const current = await prisma.farmer.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true, lastName: true, commune: { select: { code: true } } },
  });
  if (current && current.commune.code === DEMO_FARMER_COMMUNE_CODE) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: `${current.firstName} ${current.lastName}` },
    });
    return true;
  }

  const farm = await prisma.farm.findFirst({
    where: {
      archivedAt: null,
      sourceId: "BAIS_SEED",
      commune: { code: DEMO_FARMER_COMMUNE_CODE },
      parcels: {
        some: {
          archivedAt: null,
          crops: { some: { archivedAt: null, campaign: { status: "OPEN" } } },
        },
      },
    },
    orderBy: { code: "asc" },
    select: { farmerId: true, farmer: { select: { firstName: true, lastName: true } } },
  });
  if (!farm) return false;

  // Un compte ne peut être relié qu'à un seul producteur : l'ancien lien est levé avant le nouveau.
  if (current) {
    await prisma.farmer.update({ where: { id: current.id }, data: { userId: null } });
  }
  await prisma.farmer.update({
    where: { id: farm.farmerId },
    data: { userId: user.id, phoneE164: DEMO_FARMER_PHONE },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { name: `${farm.farmer.firstName} ${farm.farmer.lastName}` },
  });
  return true;
}

export const DEMO_AGENT_PHONE = "+2290190000001";
const DEMO_AGENT_FARM_COUNT = 6;

// ADR-0014 : un agent ne voit que les exploitations qu'il a lui-même enregistrées. Le registre
// synthétique (sourceId BAIS_SEED) n'a pas d'agent enregistreur, comme un import national réel :
// sans rattachement, l'espace agent de démonstration serait vide. Un lot déterministe (premières
// par code) de la commune de démonstration lui est donc attribué, dont l'exploitation reliée au
// compte agricultrice de démonstration. Idempotent ; refait après SEED_FARM_RESET.
export async function attachDemoAgentFarms(prisma: PrismaClient): Promise<number> {
  // A4 : même filet qu'au-dessus, par défense en profondeur.
  if (getServerEnv().APP_ENV === "production") return 0;

  const agent = await prisma.user.findUnique({
    where: { phoneNumber: DEMO_AGENT_PHONE },
    select: { id: true },
  });
  if (!agent) return 0;

  const farms = await prisma.farm.findMany({
    where: {
      archivedAt: null,
      sourceId: "BAIS_SEED",
      commune: { code: DEMO_FARMER_COMMUNE_CODE },
    },
    orderBy: { code: "asc" },
    take: DEMO_AGENT_FARM_COUNT,
    select: { id: true },
  });
  if (farms.length === 0) return 0;

  const result = await prisma.farm.updateMany({
    where: { id: { in: farms.map((f) => f.id) } },
    data: { registeredById: agent.id },
  });
  return result.count;
}
