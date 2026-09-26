import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { AssistantPanel } from "@/features/assistant/assistant-panel";
import { agentContext } from "@/features/assistant/suggestion-sources";
import { listFarmsForActor } from "@/modules/registry";

export const metadata: Metadata = { title: "Assistant agricole" };

// B : l'agent pose une question, pour une exploitation de son périmètre ou en général. Les
// questions transmises par les producteurs se traitent dans ses demandes (/agent/demandes).
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
  const openQuestions = context.requests.filter((request) => request.status === "OPEN").length;

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
      {/* Les questions transmises par les producteurs sont traitées dans la boîte unique des
          demandes, avec les demandes d'aide : un seul endroit à surveiller. */}
      <p className="text-sm text-muted-foreground">
        {openQuestions > 0
          ? `${openQuestions} question${openQuestions > 1 ? "s" : ""} de producteur à traiter. `
          : "Aucune question de producteur à traiter. "}
        <Link
          href={"/agent/demandes" as Route}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Demandes des producteurs
        </Link>
      </p>
    </div>
  );
}
