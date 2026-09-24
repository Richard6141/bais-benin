import { POLICY_MATRIX, type ActionCode, type Reach, type RoleCode } from "./policies.matrix";

export type ScopeType = "NATIONAL" | "DEPARTEMENT" | "COMMUNE" | "ORGANIZATION" | "SELF";

export interface RoleGrant {
  role: RoleCode;
  scopeType: ScopeType;
  // Identifiant du département, de la commune ou de l'organisation ; nul pour NATIONAL et SELF.
  scopeId: string | null;
}

export interface Actor {
  userId: string;
  grants: readonly RoleGrant[];
  // Codes des communes couvertes par les départements des affectations, résolus par le dépôt.
  communeIdsByDepartement?: ReadonlyMap<string, readonly string[]>;
}

// Description minimale d'une ressource pour la décision : à qui elle appartient et où elle est.
export interface ResourceRef {
  ownerUserId?: string | null;
  communeId?: string | null;
  departementId?: string | null;
  organizationIds?: readonly string[];
}

export type Decision = { allowed: true; via: RoleGrant } | { allowed: false; reason: string };

function grantCovers(grant: RoleGrant, resource: ResourceRef, actor: Actor): boolean {
  switch (grant.scopeType) {
    case "NATIONAL":
      return true;
    case "DEPARTEMENT":
      if (resource.departementId && resource.departementId === grant.scopeId) return true;
      if (resource.communeId && grant.scopeId) {
        return (
          actor.communeIdsByDepartement?.get(grant.scopeId)?.includes(resource.communeId) ?? false
        );
      }
      return false;
    case "COMMUNE":
      return Boolean(resource.communeId) && resource.communeId === grant.scopeId;
    case "ORGANIZATION":
      return (
        Boolean(grant.scopeId) && (resource.organizationIds ?? []).includes(grant.scopeId as string)
      );
    case "SELF":
      return Boolean(resource.ownerUserId) && resource.ownerUserId === actor.userId;
  }
}

function reachSatisfied(
  reach: Reach,
  grant: RoleGrant,
  resource: ResourceRef,
  actor: Actor,
): boolean {
  switch (reach) {
    case "NONE":
      return false;
    case "ALL":
      return true;
    case "SELF":
      return Boolean(resource.ownerUserId) && resource.ownerUserId === actor.userId;
    case "SCOPE":
      return grantCovers(grant, resource, actor);
  }
}

// Décision unitaire. Plusieurs affectations peuvent coexister : la première qui autorise suffit.
export function authorize(actor: Actor, action: ActionCode, resource: ResourceRef = {}): Decision {
  for (const grant of actor.grants) {
    const reach = POLICY_MATRIX[grant.role][action];
    if (reachSatisfied(reach, grant, resource, actor)) return { allowed: true, via: grant };
  }
  return { allowed: false, reason: `Action ${action} non autorisée pour cet utilisateur` };
}

export function can(actor: Actor, action: ActionCode, resource?: ResourceRef): boolean {
  return authorize(actor, action, resource).allowed;
}

export type ScopeFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "self"; userId: string }
  | {
      kind: "territory";
      communeIds: string[];
      departementIds: string[];
      organizationIds: string[];
      includeSelf: boolean;
    };

// Filtre à appliquer aux requêtes de liste : le dépôt le traduit en clause SQL.
// L'union des affectations est calculée ici pour que le dépôt n'ait qu'un seul cas à gérer.
export function scopeFilter(actor: Actor, action: ActionCode): ScopeFilter {
  const communeIds = new Set<string>();
  const departementIds = new Set<string>();
  const organizationIds = new Set<string>();
  let includeSelf = false;

  for (const grant of actor.grants) {
    const reach = POLICY_MATRIX[grant.role][action];
    if (reach === "NONE") continue;
    if (reach === "ALL" || (reach === "SCOPE" && grant.scopeType === "NATIONAL"))
      return { kind: "all" };
    if (reach === "SELF" || grant.scopeType === "SELF") {
      includeSelf = true;
      continue;
    }
    if (!grant.scopeId) continue;
    if (grant.scopeType === "COMMUNE") communeIds.add(grant.scopeId);
    if (grant.scopeType === "DEPARTEMENT") departementIds.add(grant.scopeId);
    if (grant.scopeType === "ORGANIZATION") organizationIds.add(grant.scopeId);
  }

  if (communeIds.size === 0 && departementIds.size === 0 && organizationIds.size === 0) {
    return includeSelf ? { kind: "self", userId: actor.userId } : { kind: "none" };
  }
  return {
    kind: "territory",
    communeIds: [...communeIds],
    departementIds: [...departementIds],
    organizationIds: [...organizationIds],
    includeSelf,
  };
}
