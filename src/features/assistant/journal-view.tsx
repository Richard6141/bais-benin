import type { Route } from "next";
import Link from "next/link";
import { NoValue } from "@/components/data-display/no-value";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JournalEntry } from "@/modules/assistant";
import { CONFIDENCE_LABELS, OUTCOME_LABELS, type ConfidenceLabel } from "./assistant-logic";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});

const ROLE_LABELS: Record<string, string> = {
  FARMER: "Producteur",
  AGENT_AGRICULTURE: "Agent",
  ADMIN_STATE: "Ministère",
  COOPERATIVE: "Coopérative",
};

interface JournalViewProps {
  entries: readonly JournalEntry[];
  /** Chemin de la page, pour les filtres par issue dans l'adresse. */
  basePath: string;
  outcome?: string;
}

// D1-D3 : journal anonymisé des conversations. L'auteur n'apparaît jamais : son rôle, sa commune
// et la date seulement. Filtre par issue dans l'adresse (« Sans réponse fiable » priorise les
// fiches à écrire), retours utile / pas utile par réponse.
export function JournalView({ entries, basePath, outcome }: JournalViewProps) {
  const filters = [
    { value: undefined, label: "Toutes" },
    ...Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filtrer par issue" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {filters.map((filter) => {
            const active = filter.value === outcome;
            return (
              <li key={filter.label} className="shrink-0">
                <Link
                  href={(filter.value ? `${basePath}?issue=${filter.value}` : basePath) as Route}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex h-11 items-center rounded-sm border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground"
                      : "inline-flex h-11 items-center rounded-sm border px-4 text-sm font-medium hover:bg-accent"
                  }
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {entries.length === 0 ? (
        <EmptyState title="Aucune conversation pour ce filtre" />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Journal des conversations de l&apos;assistant
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Auteur</TableHead>
              <TableHead>Question et réponse</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead className="text-right">Retours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.messageId} className="align-top">
                <TableCell className="tabular text-muted-foreground">
                  {dateTime.format(new Date(entry.createdAt))}
                </TableCell>
                <TableCell>
                  {ROLE_LABELS[entry.role] ?? entry.role}
                  {entry.communeName ? (
                    <span className="block text-xs text-muted-foreground">{entry.communeName}</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  <p className="font-medium">{entry.question}</p>
                  <p className="text-sm text-muted-foreground">{entry.answer}</p>
                  {entry.sources.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Fiches : {entry.sources.join(", ")}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Badge variant={entry.outcome === "ANSWERED" ? "success" : "watch"}>
                    {OUTCOME_LABELS[entry.outcome ?? ""] ?? <NoValue />}
                  </Badge>
                  {entry.confidenceLabel ? (
                    <span className="block text-xs text-muted-foreground">
                      {CONFIDENCE_LABELS[entry.confidenceLabel as ConfidenceLabel] ??
                        entry.confidenceLabel}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="tabular text-right">
                  {entry.useful} utile, {entry.notUseful} pas utile
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
