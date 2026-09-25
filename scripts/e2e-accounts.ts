import "dotenv/config";
import { prisma } from "@/database/client";
import { hashPassword } from "@/lib/auth/password";

// Comptes temporaires des tests de bout en bout.
//
//   tsx scripts/e2e-accounts.ts create --email <e> --password <p> --name <n>
//   tsx scripts/e2e-accounts.ts delete
//
// Le compte ministère de démonstration (ministere@bais.demo) n'a pas de double authentification
// et doit rester ainsi : les parcours du pilotage utilisent des comptes ADMIN_STATE jetables,
// créés avant la suite et supprimés après. Seules les adresses du domaine réservé ci-dessous sont
// manipulées ; aucun compte réel ou de démonstration ne peut être touché par ce script.

export const E2E_EMAIL_DOMAIN = "@e2e.bais.invalid";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertTestEmail(email: string) {
  if (!email.endsWith(E2E_EMAIL_DOMAIN)) {
    throw new Error(`Adresse refusée : seules les adresses ${E2E_EMAIL_DOMAIN} sont gérées ici`);
  }
}

/** Supprime un compte de test et ce qui y est rattaché (sessions, 2FA, rôles en cascade). */
async function deleteUser(id: string) {
  // Les destinataires d'alerte n'ont pas de clé étrangère en cascade vers l'utilisateur.
  await prisma.alertRecipient.deleteMany({ where: { userId: id } });
  // Journal d'audit : en ajout seul, il n'est jamais supprimé ; l'acteur passe à nul (SetNull).
  await prisma.user.delete({ where: { id } });
}

async function create(email: string, password: string, name: string) {
  assertTestEmail(email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) await deleteUser(existing.id);
  const user = await prisma.user.create({
    data: { name, email, emailVerified: true, status: "ACTIVE" },
    select: { id: true },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(password),
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: user.id, role: "ADMIN_STATE", scopeType: "NATIONAL", scopeId: null },
  });
  console.log(`Compte de test créé : ${email}`);
}

async function removeAll() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: E2E_EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });
  for (const user of users) await deleteUser(user.id);
  console.log(`Comptes de test supprimés : ${users.length}`);
}

async function main() {
  if (process.env.APP_ENV === "production") {
    throw new Error("Comptes de test refusés en production");
  }
  const command = process.argv[2];
  if (command === "create") {
    const email = argument("email");
    const password = argument("password");
    if (!email || !password) throw new Error("--email et --password sont requis");
    await create(email, password, argument("name") ?? "Compte de test (ministère)");
  } else if (command === "delete") {
    await removeAll();
  } else {
    throw new Error("Commande attendue : create ou delete");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
