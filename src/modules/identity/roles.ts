import { prisma } from "@/database/client";
import type { Actor, RoleCode, RoleGrant, ScopeType } from "@/modules/authorization";
import { recordAudit } from "@/modules/audit";

// Construit l'acteur d'autorisation à partir des affectations actives d'un utilisateur.
// Les affectations départementales sont résolues en listes de communes une fois ici,
// pour que les décisions restent des comparaisons en mémoire.
export async function loadActor(userId: string): Promise<Actor> {
  const assignments = await prisma.roleAssignment.findMany({
    where: { userId, revokedAt: null },
    select: { role: true, scopeType: true, scopeId: true },
  });
  const grants: RoleGrant[] = assignments.map((a) => ({
    role: a.role as RoleCode,
    scopeType: a.scopeType as ScopeType,
    scopeId: a.scopeId,
  }));

  const departementIds = grants
    .filter((g) => g.scopeType === "DEPARTEMENT" && g.scopeId)
    .map((g) => g.scopeId as string);
  let communeIdsByDepartement: Map<string, string[]> | undefined;
  if (departementIds.length > 0) {
    const communes = await prisma.commune.findMany({
      where: { departementId: { in: departementIds }, archivedAt: null },
      select: { id: true, departementId: true },
    });
    communeIdsByDepartement = new Map();
    for (const commune of communes) {
      const list = communeIdsByDepartement.get(commune.departementId) ?? [];
      list.push(commune.id);
      communeIdsByDepartement.set(commune.departementId, list);
    }
  }
  return { userId, grants, communeIdsByDepartement };
}

export interface GrantRoleInput {
  userId: string;
  role: RoleCode;
  scopeType: ScopeType;
  scopeId?: string | null;
  grantedById?: string | null;
}

export async function grantRole(input: GrantRoleInput) {
  const existing = await prisma.roleAssignment.findFirst({
    where: {
      userId: input.userId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      revokedAt: null,
    },
  });
  if (existing) return existing;
  const created = await prisma.roleAssignment.create({
    data: {
      userId: input.userId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      grantedById: input.grantedById ?? null,
    },
  });
  await recordAudit({
    action: "user.role.granted",
    actorId: input.grantedById ?? null,
    resourceType: "user",
    resourceId: input.userId,
    details: { role: input.role, scopeType: input.scopeType, scopeId: input.scopeId ?? null },
  });
  return created;
}

export async function revokeRole(assignmentId: string, revokedById: string | null) {
  const assignment = await prisma.roleAssignment.update({
    where: { id: assignmentId },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    action: "user.role.revoked",
    actorId: revokedById,
    resourceType: "user",
    resourceId: assignment.userId,
    details: {
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    },
  });
  return assignment;
}

// Rôle principal : sert à choisir l'espace d'atterrissage après connexion.
const ROLE_PRIORITY: RoleCode[] = [
  "ADMIN_STATE",
  "AGENT_AGRICULTURE",
  "COOPERATIVE",
  "BUYER",
  "FARMER",
];

export function primaryRole(actor: Actor): RoleCode | null {
  for (const role of ROLE_PRIORITY) {
    if (actor.grants.some((g) => g.role === role)) return role;
  }
  return null;
}

export const SPACE_BY_ROLE: Record<RoleCode, string> = {
  ADMIN_STATE: "/pilotage",
  AGENT_AGRICULTURE: "/agent",
  COOPERATIVE: "/cooperative",
  BUYER: "/acheteur",
  FARMER: "/agriculteur",
};
