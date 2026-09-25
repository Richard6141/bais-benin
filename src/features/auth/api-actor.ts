import { resolveSession } from "@/features/auth/session";
import type { Actor } from "@/modules/authorization";

export interface ApiActor {
  userId: string;
  actor: Actor;
}

// B1 : acteur d'une route API. Réutilise resolveSession (session.ts) pour appliquer les mêmes
// contrôles applicatifs que les pages — suspension de compte et limite de 12 h pour les rôles
// institutionnels, compte sans NPI lié (ADR-0012) — au lieu de se contenter d'une session valide
// et des rôles bruts.
export async function getApiActor(headers: Headers): Promise<ApiActor | null> {
  const resolved = await resolveSession(headers);
  if (!resolved) return null;
  return { userId: resolved.user.id, actor: resolved.actor };
}
