import { ShieldOff } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser, homeFor } from "@/features/auth/session";

export const metadata: Metadata = { title: "Accès refusé" };

export default async function AccessDeniedPage() {
  const user = await getCurrentUser();
  const home = user ? homeFor(user) : "/connexion";
  return (
    <EmptyState
      icon={<ShieldOff />}
      title="Cet espace n'est pas accessible avec votre compte"
      description="Votre rôle ne permet pas d'ouvrir cette page. Si vous pensez qu'il s'agit d'une erreur, rapprochez-vous de votre agent ou de l'administrateur de la plateforme."
      action={
        <Button asChild>
          <Link href={home as Route}>Revenir à mon espace</Link>
        </Button>
      }
    />
  );
}
