import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { AgentRequests } from "@/features/assistant/agent-requests";
import { AssistantPanel } from "@/features/assistant/assistant-panel";
import { agentContext } from "@/features/assistant/suggestion-sources";
import { listFarmsForActor } from "@/modules/registry";

export const metadata: Metadata = { title: "Assistant agricole" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

// B : l'agent pose une question, pour une exploitation de son périmètre ou en général, et traite
// les demandes transmises par les producteurs de ses communes.
export default async function AgentAssistantPage(props: PageProps<"/agent/assistant">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/assistant" });
  const params = await props.searchParams;
  const [farms, context] = await Promise.all([
    listFarmsForActor(user.actor, { limit: 200 }),
    agentContext(user.actor),
  ]);
  // Libellé d'exploitation : nom ou producteur, et commune ; jamais de téléphone.
  const options = farms.items.map((farm) => ({
    code: farm.code,
    label: `${farm.name ?? farm.farmer.displayName} (${farm.commune.name})`,
  }));
  const requested = typeof params.exploitation === "string" ? params.exploitation : null;
  const initialFarmCode = options.some((o) => o.code === requested) ? requested : null;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title="Assistant agricole"
        description="Des réponses tirées de fiches techniques citées, pour une exploitation de vos communes ou une question générale. Les coordonnées des producteurs ne sont jamais transmises."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/agent/assistant/journal" as Route}>Journal de mes communes</Link>
          </Button>
        }
      />
      <AssistantPanel
        audience="agent"
        suggestions={context.suggestions}
        farms={options}
        initialFarmCode={initialFarmCode}
      />
      <section aria-labelledby="demandes-titre" className="flex flex-col gap-4">
        <h2 id="demandes-titre" className="text-xl font-semibold">
          Demandes des producteurs
        </h2>
        <AgentRequests
          requests={context.requests.map((request) => ({
            id: request.id,
            status: request.status,
            communeName: request.communeName,
            question: request.question,
            answer: request.answer,
            createdAt: dateFormat.format(request.createdAt),
          }))}
        />
      </section>
    </div>
  );
}
