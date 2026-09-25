import { resolveSession } from "@/features/auth/session";
import type { Actor } from "@/modules/authorization";

export interface ApiActor {
  userId: string;
  actor: Actor;
}

// B1 : acteur d'une route API. Réutilise resolveSession (session.ts) pour appliquer les mêmes
// contrôles applicatifs que les pages — suspension de compte et limite de 12 h pour les rôles
// institutionnels — au lieu de se contenter d'une session valide et des rôles bruts. Refuse en
// plus les administrateurs de l'État qui n'ont pas encore activé la double authentification :
// les pages les redirigent vers l'écran d'activation (requireRole, session.ts), mais l'API n'a
// pas d'équivalent — elle doit donc refuser plutôt que servir des données sensibles à une
// session ADMIN_STATE encore protégée par le seul mot de passe.
export async function getApiActor(headers: Headers): Promise<ApiActor | null> {
  const resolved = await resolveSession(headers);
  if (!resolved) return null;
  if (resolved.role === "ADMIN_STATE" && !resolved.user.twoFactorEnabled) return null;
  return { userId: resolved.user.id, actor: resolved.actor };
}
