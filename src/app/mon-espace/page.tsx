import type { Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/features/auth/session";

export const dynamic = "force-dynamic";

// « Mon espace » depuis l'en-tête public : l'espace du rôle principal pour un compte connecté, la
// connexion sinon. Contrairement à /apres-connexion, ce passage n'est pas une connexion et n'est
// pas journalisé comme telle.
export default async function MySpacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  redirect(homeFor(user) as Route);
}
