import { prisma } from "@/database/client";
import type { RoleCode, ScopeType } from "@/modules/authorization";
import { recordAudit } from "@/modules/audit";
import { bindNpiOnSignIn, isNpiTaken } from "./npi";
import { grantRole, revokeRole } from "./roles";

// Ouverture des comptes (ADR-0013). Une inscription libre sur /connexion ne crée qu'un compte
// d'agriculteur ; les agents, le ministère, les coopératives et les acheteurs reçoivent le leur de
// l'administration, qui lie un NPI et un numéro à un rôle et à une portée.

/**
 * Inscription d'un agriculteur, appelée juste après la création du compte par la connexion :
 * rôle FARMER sur lui-même, puis rattachement à la fiche producteur enregistrée par un agent avec
 * ce numéro, s'il en existe une seule qui ne soit reliée à aucun compte. Plusieurs fiches pour un
 * même numéro : rien n'est rattaché, l'agent tranchera.
 */
export async function provisionFarmerSignUp(
  userId: string,
  phone: string,
): Promise<{ linkedFarmerId: string | null }> {
  await grantRole({ userId, role: "FARMER", scopeType: "SELF" });
  const candidates = await prisma.farmer.findMany({
    where: { phoneE164: phone, userId: null, archivedAt: null },
    select: { id: true, firstName: true, lastName: true },
    take: 2,
  });
  const farmer = candidates.length === 1 ? candidates[0] : undefined;
  if (!farmer) return { linkedFarmerId: null };

  // Condition sur userId : deux inscriptions simultanées ne relient jamais la même fiche.
  const linked = await prisma.farmer.updateMany({
    where: { id: farmer.id, userId: null },
    data: { userId },
  });
  if (linked.count === 0) return { linkedFarmerId: null };
  await prisma.user.update({
    where: { id: userId },
    data: { name: `${farmer.firstName} ${farmer.lastName}` },
  });
  await recordAudit({
    action: "user.farmer.linked",
    actorId: userId,
    resourceType: "farmer",
    resourceId: farmer.id,
    details: { via: "sign-up", match: "phone" },
  });
  return { linkedFarmerId: farmer.id };
}

export interface ProvisionInput {
  npi: string;
  /** Numéro au format E.164 (+229…), déjà normalisé. */
  phone: string;
  role: RoleCode;
  scopeType: ScopeType;
  scopeId: string | null;
  name?: string;
}

export type ProvisionResult =
  { ok: true; userId: string; created: boolean } | { ok: false; reason: string };

/**
 * Ouverture d'un compte par l'administration : trouve le compte par son NPI ou son numéro (les
 * deux doivent alors désigner le même compte), le crée sinon, lie le NPI et attribue le rôle. Le
 * rôle agriculteur donné automatiquement à l'inscription est retiré d'un compte qui reçoit un
 * autre rôle sans être relié à une fiche producteur.
 */
export async function provisionAccount(input: ProvisionInput): Promise<ProvisionResult> {
  const byPhone = await prisma.user.findUnique({
    where: { phoneNumber: input.phone },
    select: { id: true, npiIndex: true },
  });
  if (!byPhone && (await isNpiTaken(input.npi))) {
    return { ok: false, reason: "Ce NPI est déjà relié à un compte portant un autre numéro" };
  }

  let userId = byPhone?.id;
  const created = !userId;
  if (!userId) {
    const user = await prisma.user.create({
      data: {
        name: input.name ?? input.phone,
        email: `${input.phone.replace("+", "")}@telephone.bais.invalid`,
        emailVerified: false,
        phoneNumber: input.phone,
        phoneNumberVerified: false,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    userId = user.id;
  } else if (input.name) {
    await prisma.user.update({ where: { id: userId }, data: { name: input.name } });
  }

  const binding = await bindNpiOnSignIn(userId, input.npi, "admin");
  if (!binding.ok) {
    if (created) await prisma.user.delete({ where: { id: userId } });
    return { ok: false, reason: "Ce NPI et ce numéro ne désignent pas le même compte" };
  }

  await grantRole({
    userId,
    role: input.role,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  if (input.role !== "FARMER") await dropAutomaticFarmerRole(userId);
  return { ok: true, userId, created };
}

async function dropAutomaticFarmerRole(userId: string) {
  const farmerRecord = await prisma.farmer.findUnique({ where: { userId }, select: { id: true } });
  if (farmerRecord) return;
  const automatic = await prisma.roleAssignment.findMany({
    where: { userId, role: "FARMER", scopeType: "SELF", revokedAt: null, grantedById: null },
    select: { id: true },
  });
  for (const assignment of automatic) await revokeRole(assignment.id, null);
}
