import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RequestList } from "@/features/assistance/request-list";
import { requireRole } from "@/features/auth/session";
import { listAssistanceForActor, type AssistanceStatus } from "@/modules/assistance";

export const metadata: Metadata = { title: "Demandes des producteurs" };

const FILTERS: { status?: AssistanceStatus; label: string }[] = [
  { status: "RECEIVED", label: "À traiter" },
  { status: "IN_PROGRESS", label: "En cours" },
  { label: "Toutes" },
];

function parseStatus(value: string | string[] | undefined): AssistanceStatus | undefined {
  return value === "RECEIVED" || value === "IN_PROGRESS" || value === "RESOLVED"
    ? value
    : undefined;
}

// Demandes « Solliciter l'État » des producteurs de la commune de l'agent, à traiter d'abord.
export default async function AgentRequestsPage(props: PageProps<"/agent/demandes">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/demandes" });
  const params = await props.searchParams;
  const status = params.statut === undefined ? "RECEIVED" : parseStatus(params.statut);
  const requests = await listAssistanceForActor(user.actor, { status });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title="Demandes des producteurs"
        description="Demandes adressées à l'État par les producteurs de votre commune : prenez-les en charge, rappelez le producteur, puis notez la réponse donnée."
      />
      <nav aria-label="Filtrer les demandes" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filter.status === status;
          const href = `/agent/demandes?statut=${filter.status ?? "TOUTES"}`;
          return (
            <Button key={filter.label} asChild size="sm" variant={active ? "default" : "outline"}>
              <Link href={href as Route} aria-current={active ? "page" : undefined}>
                {filter.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <RequestList
        requests={requests}
        forAgent
        empty={status === "RECEIVED" ? "Aucune demande en attente." : "Aucune demande."}
      />
    </div>
  );
}
