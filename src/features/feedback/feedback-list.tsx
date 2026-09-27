import { Monitor, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  KIND_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type FeedbackStatus,
} from "@/modules/feedback/rules";
import type { FeedbackRow } from "@/modules/feedback/service";
import { updateFeedbackStatusAction } from "./manage-actions";

const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});

const STATUS_VARIANT: Record<FeedbackStatus, "info" | "watch" | "success"> = {
  NEW: "info",
  SEEN: "watch",
  DONE: "success",
};

/** Étapes proposées depuis chaque état : on avance, ou on rouvre un avis traité. */
const NEXT: Record<FeedbackStatus, { status: FeedbackStatus; label: string }[]> = {
  NEW: [
    { status: "SEEN", label: "Marquer vu" },
    { status: "DONE", label: "Traité" },
  ],
  SEEN: [
    { status: "DONE", label: "Traité" },
    { status: "NEW", label: "Remettre en nouveau" },
  ],
  DONE: [{ status: "SEEN", label: "Rouvrir" }],
};

// Liste des avis des testeurs (chantier J), vue du ministère : le message, son contexte (type,
// rôle, page, écran, note) et son état, sans jamais l'auteur.
export function FeedbackList({ rows }: { rows: readonly FeedbackRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun avis pour ces filtres"
        description="Les avis donnés depuis l'application apparaissent ici."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
              <span className="font-semibold">{KIND_LABELS[row.kind]}</span>
              <span className="text-muted-foreground">{ROLE_LABELS[row.role]}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {row.device === "MOBILE" ? (
                  <Smartphone className="size-4" aria-hidden />
                ) : (
                  <Monitor className="size-4" aria-hidden />
                )}
                {row.device === "MOBILE" ? "Téléphone" : "Ordinateur"}
              </span>
              {row.rating !== null ? (
                <span className="text-muted-foreground">Note {row.rating} sur 5</span>
              ) : null}
              <time
                className="ml-auto text-muted-foreground"
                dateTime={row.createdAt.toISOString()}
              >
                {date.format(row.createdAt)}
              </time>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap">{row.message}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="text-xs text-muted-foreground">{row.pagePath}</code>
              <div className="flex gap-2">
                {NEXT[row.status].map((next) => (
                  <form key={next.status} action={updateFeedbackStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value={next.status} />
                    <Button type="submit" variant="outline" size="sm" className="h-9">
                      {next.label}
                    </Button>
                  </form>
                ))}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
