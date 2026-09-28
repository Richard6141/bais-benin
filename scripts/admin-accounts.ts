import "dotenv/config";
import { prisma } from "@/database/client";
import { normalizeBeninPhone } from "@/lib/auth/phone";
import { maskNpi } from "@/lib/crypto/npi";
import type { RoleCode, ScopeType } from "@/modules/authorization";
import { provisionAccount, validateNpiFormat } from "@/modules/identity";

// Ouverture des comptes par l'administration (ADR-0013). Les agents de terrain s'ouvrent depuis le
// pilotage (/pilotage/agents) ; ce script reste pour les autres rôles et le premier compte du
// ministère.
// Une inscription sur /connexion ne crée qu'un compte d'agriculteur : un agent, le ministère, une
// coopérative ou un acheteur reçoit ici un compte lié à son NPI et à son numéro, puis se connecte
// comme tout le monde (NPI, numéro, code WhatsApp).
//
//   pnpm admin:compte --npi <13 chiffres> --telephone <01XXXXXXXX> --role <rôle> [options]
//
//   --role        ADMIN_STATE | AGENT_AGRICULTURE | COOPERATIVE | BUYER | FARMER
//   --commune     code de commune (ex. BJ-DON-003), portée d'un agent
//   --departement code de département (ex. BJ-DO), portée d'un agent à la place de --commune
//   --nom         nom affiché du compte
//
// Le NPI n'est jamais affiché en clair : seuls ses deux derniers chiffres apparaissent.

const ROLES: readonly RoleCode[] = [
  "ADMIN_STATE",
  "AGENT_AGRICULTURE",
  "COOPERATIVE",
  "BUYER",
  "FARMER",
];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveScope(
  role: RoleCode,
): Promise<{ scopeType: ScopeType; scopeId: string | null }> {
  if (role === "ADMIN_STATE") return { scopeType: "NATIONAL", scopeId: null };
  if (role !== "AGENT_AGRICULTURE") return { scopeType: "SELF", scopeId: null };

  const communeCode = argument("commune");
  const departementCode = argument("departement");
  if (communeCode) {
    const commune = await prisma.commune.findUnique({
      where: { code: communeCode },
      select: { id: true },
    });
    if (!commune) throw new Error(`Commune inconnue : ${communeCode}`);
    return { scopeType: "COMMUNE", scopeId: commune.id };
  }
  if (departementCode) {
    const departement = await prisma.departement.findUnique({
      where: { code: departementCode },
      select: { id: true },
    });
    if (!departement) throw new Error(`Département inconnu : ${departementCode}`);
    return { scopeType: "DEPARTEMENT", scopeId: departement.id };
  }
  throw new Error("Un agent a besoin d'une portée : --commune <code> ou --departement <code>");
}

async function main() {
  const npi = (argument("npi") ?? "").replace(/\D/g, "");
  const format = validateNpiFormat(npi);
  if (!format.valid) throw new Error(format.reason ?? "NPI invalide");
  const phone = normalizeBeninPhone(argument("telephone") ?? "");
  if (!phone) throw new Error("Numéro invalide : dix chiffres commençant par 01");
  const role = argument("role") as RoleCode | undefined;
  if (!role || !ROLES.includes(role)) {
    throw new Error(`Rôle attendu : ${ROLES.join(", ")}`);
  }

  const scope = await resolveScope(role);
  const result = await provisionAccount({
    npi,
    phone: phone.e164,
    role,
    ...scope,
    name: argument("nom"),
  });
  if (!result.ok) throw new Error(result.reason);
  console.log(
    `${result.created ? "Compte ouvert" : "Compte existant mis à jour"} : NPI ${maskNpi(npi)}, ` +
      `+229 ${phone.national}, rôle ${role} (${scope.scopeType}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
