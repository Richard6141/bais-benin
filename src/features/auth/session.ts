import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth/auth";
import {
  authorize,
  type ActionCode,
  type Actor,
  type ResourceRef,
  type RoleCode,
} from "@/modules/authorization";
import { SPACE_BY_ROLE, loadActor, primaryRole } from "@/modules/identity";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  twoFactorEnabled: boolean;
  status: string;
  actor: Actor;
  primaryRole: RoleCode | null;
  session: { id: string; expiresAt: Date };
}

// Institutions : 12 h maximum (docs/06 §2), contrôlé ici car better-auth n'a qu'une durée globale.
const INSTITUTIONAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const INSTITUTIONAL_ROLES: RoleCode[] = ["ADMIN_STATE", "COOPERATIVE", "BUYER"];

// Une lecture par requête : React met le résultat en cache pour tous les composants serveur.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const { user, session } = result;
  if (user.status === "SUSPENDED" || user.status === "DELETED") return null;

  const actor = await loadActor(user.id);
  const role = primaryRole(actor);
  if (role && INSTITUTIONAL_ROLES.includes(role)) {
    const age = Date.now() - new Date(session.createdAt).getTime();
    if (age > INSTITUTIONAL_MAX_AGE_MS) return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber ?? null,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    status: user.status ?? "ACTIVE",
    actor,
    primaryRole: role,
    session: { id: session.id, expiresAt: new Date(session.expiresAt) },
  };
});

export async function requireUser(options: { returnTo?: string } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = options.returnTo
      ? `/connexion?suite=${encodeURIComponent(options.returnTo)}`
      : "/connexion";
    redirect(target as Route);
  }
  return user;
}

// Garde d'espace : le rôle attendu doit être présent ; les administrateurs de l'État
// doivent avoir activé la double authentification avant d'accéder au pilotage.
export async function requireRole(
  role: RoleCode,
  options: { returnTo?: string } = {},
): Promise<CurrentUser> {
  const user = await requireUser(options);
  const hasRole = user.actor.grants.some((g) => g.role === role);
  if (!hasRole) redirect("/acces-refuse");
  if (role === "ADMIN_STATE" && !user.twoFactorEnabled) redirect("/compte/securite?obligatoire=1");
  return user;
}

export async function requirePermission(
  action: ActionCode,
  resource?: ResourceRef,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!authorize(user.actor, action, resource).allowed) redirect("/acces-refuse");
  return user;
}

export function homeFor(user: CurrentUser): string {
  return user.primaryRole ? SPACE_BY_ROLE[user.primaryRole] : "/compte";
}
