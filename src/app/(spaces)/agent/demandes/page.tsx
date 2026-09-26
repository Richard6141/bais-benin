import { Inbox } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AssistanceRequestBody } from "@/features/assistance/request-list";
import { AgentQuestionBody, type AgentRequestView } from "@/features/assistant/agent-requests";
import { requireRole } from "@/features/auth/session";
import type { AssistanceItem } from "@/modules/assistance";
import { listAssistanceForActor } from "@/modules/assistance";
import { ERASED_QUESTION, listAgentRequests } from "@/modules/assistant";

export const metadata: Metadata = { title: "Demandes des producteurs" };

type Filter = "a-traiter" | "en-cours" | "toutes";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "a-traiter", label: "À traiter" },
  { value: "en-cours", label: "En cours" },
  { value: "toutes", label: "Toutes" },
];

// Anciennes adresses (?statut=RECEIVED, IN_PROGRESS, TOUTES) : toujours comprises.
function parseFilter(params: Record<string, string | string[] | undefined>): Filter {
  const value = params.filtre ?? params.statut;
  if (value === "en-cours" || value === "IN_PROGRESS") return "en-cours";
  if (value === "toutes" || value === "TOUTES" || value === "RESOLVED") return "toutes";
  return "a-traiter";
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});

type InboxItem =
  | { kind: "aide"; id: string; at: Date; open: boolean; request: AssistanceItem }
  | { kind: "question"; id: string; at: Date; open: boolean; request: AgentRequestView };

// Boîte unique des demandes des producteurs de la commune de l'agent : les demandes d'aide
// adressées à l'État (« Solliciter l'État ») et les questions transmises depuis l'assistant
// (« Demander à mon agent »), mêlées par date, chacune avec son origine. À traiter d'abord.
export default async function AgentRequestsPage(props: PageProps<"/agent/demandes">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/demandes" });
  const filter = parseFilter(await props.searchParams);
  const [assistance, questions] = await Promise.all([
    listAssistanceForActor(user.actor, { limit: 200 }),
    listAgentRequests(user.actor).catch(() => []),
  ]);

  const all: InboxItem[] = [
    ...assistance.map((request) => ({
      kind: "aide" as const,
      id: request.id,
      at: request.createdAt,
      open: request.status !== "RESOLVED",
      request,
    })),
    ...questions
      .filter((question) => question.question !== ERASED_QUESTION)
      .map((question) => ({
        kind: "question" as const,
        id: question.id,
        at: question.createdAt,
        open: question.status === "OPEN",
        request: {
          id: question.id,
          status: question.status,
          communeName: question.communeName,
          question: question.question,
          answer: question.answer,
          createdAt: dateFormat.format(question.createdAt),
        },
      })),
  ];
  const counts: Record<Filter, number> = {
    "a-traiter": all.filter(
      (item) =>
        (item.kind === "aide" && item.request.status === "RECEIVED") ||
        (item.kind === "question" && item.open),
    ).length,
    "en-cours": all.filter((item) => item.kind === "aide" && item.request.status === "IN_PROGRESS")
      .length,
    toutes: all.length,
  };
  const visible = all
    .filter((item) =>
      filter === "toutes"
        ? true
        : filter === "en-cours"
          ? item.kind === "aide" && item.request.status === "IN_PROGRESS"
          : (item.kind === "aide" && item.request.status === "RECEIVED") ||
            (item.kind === "question" && item.open),
    )
    .sort((a, b) => Number(b.open) - Number(a.open) || b.at.getTime() - a.at.getTime());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title="Demandes des producteurs"
        description="Demandes d'aide adressées à l'État et questions transmises depuis l'assistant par les producteurs de votre commune. Prenez-les en charge, rappelez le producteur, puis notez la réponse donnée."
      />
      <nav aria-label="Filtrer les demandes" className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <Button
              key={option.value}
              asChild
              variant={active ? "default" : "outline"}
              className="h-11 rounded-full md:h-9"
            >
              <Link
                href={`/agent/demandes?filtre=${option.value}` as Route}
                aria-current={active ? "page" : undefined}
              >
                {option.label}
                <span className="tabular ml-1 opacity-80">{counts[option.value]}</span>
              </Link>
            </Button>
          );
        })}
      </nav>
      {visible.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={filter === "a-traiter" ? "Aucune demande à traiter" : "Aucune demande"}
          description="Les demandes d'aide et les questions des producteurs de votre commune arrivent ici."
        />
      ) : (
        <ul
          aria-label="Demandes des producteurs"
          className="flex flex-col divide-y rounded-lg border"
        >
          {visible.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {item.kind === "aide"
                  ? "Demande d'aide à l'État"
                  : "Question transmise depuis l'assistant"}
              </p>
              {item.kind === "aide" ? (
                <AssistanceRequestBody request={item.request} forAgent />
              ) : (
                <AgentQuestionBody request={item.request} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
