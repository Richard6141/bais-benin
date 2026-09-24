import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/safe-next-path";
import { recordAudit } from "@/modules/audit";

export const dynamic = "force-dynamic";

// Point d'atterrissage après authentification : journalise la connexion et envoie
// l'utilisateur vers l'espace de son rôle principal, ou vers la page demandée.
// C'est une page (et non une route) pour que la navigation client suive la redirection.
export default async function AfterSignInPage({ searchParams }: PageProps<"/apres-connexion">) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const requestHeaders = await headers();
  await recordAudit({
    action: "auth.sign_in",
    actorId: user.id,
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent"),
  });

  const params = await searchParams;
  const nextPath = safeNextPath(params.suite);
  redirect((nextPath ?? homeFor(user)) as Route);
}
