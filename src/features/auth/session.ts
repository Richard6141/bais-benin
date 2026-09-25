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
  /** État du NPI lié au compte (ADR-0012) : toujours présent pour une session valide. */
  npiStatus: string;
  status: string;
  actor: Actor;
  primaryRole: RoleCode | null;
  session: { id: string; expiresAt: Date };
}

// Institutions : 12 h maximum (docs/06 §2), contrôlé ici car better-auth n'a qu'une durée globale.
const INSTITUTIONAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const INSTITUTIONAL_ROLES: RoleCode[] = ["ADMIN_STATE", "COOPERATIVE", "BUYER"];

// B1 : les contrôles de session qui dépendent de la base (suspension, limite institutionnelle
// de 12 h) sont mis en commun ici entre les pages (getCurrentUser) et l'API (api-actor.ts,
// getApiActor) — jusqu'ici seules les pages en bénéficiaient, l'API se contentait de la
// session brute et des rôles. better-auth n'a qu'une durée de session globale ; ces règles
// sont donc réévaluées applicativement à chaque lecture plutôt que déléguées à sa config.
export type SessionUser = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];
export type SessionRecord = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["session"];

export interface ResolvedSession {
  user: SessionUser;
  session: SessionRecord;
  actor: Actor;
  role: RoleCode | null;
}

export async function resolveSession(headersInput: Headers): Promise<ResolvedSession | null> {
  const result = await auth.api.getSession({ headers: headersInput });
  if (!result) return null;
  const { user, session } = result;
  if (user.status === "SUSPENDED" || user.status === "DELETED") return null;
  // ADR-0012 : toute connexion lie un NPI au compte. Une session sans NPI (ouverte avant la
  // connexion par NPI) n'est plus reconnue : l'utilisateur se reconnecte avec son NPI.
  if (!user.npiStatus || user.npiStatus === "NONE") return null;

  const actor = await loadActor(user.id);
  const role = primaryRole(actor);
  if (role && INSTITUTIONAL_ROLES.includes(role)) {
    const age = Date.now() - new Date(session.createdAt).getTime();
    if (age > INSTITUTIONAL_MAX_AGE_MS) return null;
  }
  return { user, session, actor, role };
}

// Une lecture par requête : React met le résultat en cache pour tous les composants serveur.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const resolved = await resolveSession(await headers());
  if (!resolved) return null;
  const { user, session, actor, role } = resolved;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber ?? null,
    npiStatus: user.npiStatus ?? "NONE",
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

// Garde d'espace : le rôle attendu doit être présent. L'identité (NPI et code WhatsApp) est
// déjà exigée à la connexion de tout compte, ministère compris (ADR-0012).
export async function requireRole(
  role: RoleCode,
  options: { returnTo?: string } = {},
): Promise<CurrentUser> {
  const user = await requireUser(options);
  const hasRole = user.actor.grants.some((g) => g.role === role);
  if (!hasRole) redirect("/acces-refuse");
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
