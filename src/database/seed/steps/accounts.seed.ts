import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";

// Comptes de démonstration. Les téléphones commencent par 01 9 (jamais attribués par les
// opérateurs) et acceptent le code OTP_DEMO_CODE quand il est défini ; les comptes
// institutionnels partagent le mot de passe DEMO_ACCOUNT_PASSWORD. Rien de tout cela
// n'existe en production : lib/env.ts interdit OTP_DEMO_CODE hors développement.

export const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "Demo-Bais-2026!";

export interface DemoAccount {
  key: string;
  name: string;
  email: string;
  phone?: string;
  role: "ADMIN_STATE" | "AGENT_AGRICULTURE" | "FARMER" | "COOPERATIVE" | "BUYER";
  scope: { type: "NATIONAL" | "COMMUNE" | "SELF" | "ORGANIZATION"; communeCode?: string };
  password?: boolean;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "ministere",
    name: "Analyste du ministère (démonstration)",
    email: "ministere@bais.demo",
    role: "ADMIN_STATE",
    scope: { type: "NATIONAL" },
    password: true,
  },
  {
    key: "agent-djougou",
    name: "Agent de terrain, Djougou (démonstration)",
    email: "+2290190000001@telephone.bais.invalid",
    phone: "+2290190000001",
    role: "AGENT_AGRICULTURE",
    scope: { type: "COMMUNE", communeCode: "BJ-DON-003" },
  },
  {
    key: "agricultrice-djougou",
    name: "Agricultrice, Djougou (démonstration)",
    email: "+2290190000002@telephone.bais.invalid",
    phone: "+2290190000002",
    role: "FARMER",
    scope: { type: "SELF" },
  },
  {
    key: "cooperative",
    name: "Gestionnaire de coopérative (démonstration)",
    email: "cooperative@bais.demo",
    role: "COOPERATIVE",
    scope: { type: "SELF" },
    password: true,
  },
  {
    key: "acheteur",
    name: "Acheteur (démonstration)",
    email: "acheteur@bais.demo",
    role: "BUYER",
    scope: { type: "SELF" },
    password: true,
  },
];

export async function seedDemoAccounts(prisma: PrismaClient): Promise<number> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        name: account.name,
        email: account.email,
        emailVerified: account.password === true,
        phoneNumber: account.phone ?? null,
        phoneNumberVerified: account.phone ? true : null,
        status: "ACTIVE",
      },
      update: { name: account.name, status: "ACTIVE" },
      select: { id: true },
    });

    if (account.password) {
      const existing = await prisma.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
        select: { id: true },
      });
      if (existing) {
        await prisma.account.update({
          where: { id: existing.id },
          data: { password: passwordHash },
        });
      } else {
        await prisma.account.create({
          data: {
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: passwordHash,
          },
        });
      }
    }

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
