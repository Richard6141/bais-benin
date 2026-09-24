import { auth } from "@/lib/auth/auth";
import { loadActor } from "@/modules/identity";
import type { Actor } from "@/modules/authorization";

export interface ApiActor {
  userId: string;
  actor: Actor;
}

// Acteur d'une route API : session better-auth lue depuis les en-têtes de la requête,
// puis rôles et périmètres chargés. Null sans session valide (la route répond 401).
export async function getApiActor(headers: Headers): Promise<ApiActor | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const actor = await loadActor(session.user.id);
  return { userId: session.user.id, actor };
}
