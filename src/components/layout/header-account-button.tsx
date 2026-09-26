"use client";

import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

// Accès au compte dans l'en-tête public : « Mon espace » quand une session est ouverte, « Se
// connecter » sinon. La session est lue dans le navigateur pour garder les pages publiques
// statiques ; tant qu'elle n'est pas connue, le bouton de connexion s'affiche.
export function HeaderAccountButton() {
  const { data } = authClient.useSession();
  return (
    <Button asChild className="h-10">
      {data?.user ? (
        <Link href={"/mon-espace" as Route}>Mon espace</Link>
      ) : (
        <Link href="/connexion">Se connecter</Link>
      )}
    </Button>
  );
}
