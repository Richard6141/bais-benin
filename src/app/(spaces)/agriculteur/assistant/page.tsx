import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { AssistantPanel } from "@/features/assistant/assistant-panel";
import { farmerContext, readableHistory } from "@/features/assistant/suggestion-sources";

export const metadata: Metadata = { title: "Poser une question" };

// A : l'agriculteur pose une question. Trois suggestions tirées de sa situation (cultures de la
// campagne, alerte de sa commune, météo), ses dernières questions, une réponse courte sourcée.
export default async function FarmerAssistantPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/assistant" });
  const [context, history] = await Promise.all([
    farmerContext(user.actor, user.id),
    readableHistory(user.actor),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Assistant agricole"
        title="Poser une question"
        description={`Des réponses courtes tirées de fiches techniques citées${context.communeName ? `, adaptées à ${context.communeName}` : ""}. Quand l'assistant ne sait pas, il le dit et vous oriente vers votre agent.`}
      />
      <AssistantPanel audience="farmer" suggestions={context.suggestions} history={history} />
      <Button asChild variant="outline" className="h-14 w-full text-base">
        <Link href="/agriculteur">Retour à mon exploitation</Link>
      </Button>
    </div>
  );
}
