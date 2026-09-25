import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { MINISTRY_SUGGESTIONS } from "@/features/assistant/assistant-logic";
import { AssistantPanel } from "@/features/assistant/assistant-panel";

export const metadata: Metadata = { title: "Assistant d'analyse" };

// C : assistant d'analyse du ministère. Le modèle choisit un indicateur dans une liste fermée ;
// les chiffres viennent du registre et du monitoring, tels quels, masqués et sourcés. Le modèle
// n'écrit aucun chiffre. requireRole("ADMIN_STATE") réserve la page au ministère.
export default async function MinistryAssistantPage() {
  await requireRole("ADMIN_STATE", { returnTo: "/pilotage/assistant" });
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Assistant d'analyse"
        description="Posez une question sur le registre ou les alertes : l'assistant retrouve l'indicateur et l'affiche avec sa source. Aucun chiffre n'est calculé par le modèle."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/pilotage/assistant/journal" as Route}>Journal des conversations</Link>
          </Button>
        }
      />
      <AssistantPanel audience="ministry" suggestions={MINISTRY_SUGGESTIONS} />
    </div>
  );
}
