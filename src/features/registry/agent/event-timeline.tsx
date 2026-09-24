import { EmptyState } from "@/components/feedback/empty-state";
import { EVENT_LABELS, formatDateTime } from "./labels";

export interface TimelineEvent {
  id: string;
  kind: string;
  occurredAt: string;
  summary?: string | null;
}

// Fil chronologique des événements d'une exploitation : une ligne par événement,
// le libellé métier d'abord, la date ensuite (docs/modules/registre-parcours-ux.md §2.E).
export function EventTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Aucun événement"
        description="Les enregistrements et visites apparaîtront ici."
      />
    );
  }
  return (
    <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.45rem] size-3 rounded-full border-2 border-background bg-primary"
          />
          <p className="font-medium">{EVENT_LABELS[event.kind] ?? event.kind}</p>
          {event.summary ? <p className="text-sm text-muted-foreground">{event.summary}</p> : null}
          <time dateTime={event.occurredAt} className="text-xs text-muted-foreground">
            {formatDateTime(event.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

// Résumé lisible d'une charge utile d'événement, sans jamais afficher de JSON brut.
export function summarizeEvent(kind: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  switch (kind) {
    case "PARCEL_ADDED":
      return typeof p.code === "string" ? `Parcelle ${p.code}` : null;
    case "CROP_DECLARED":
      return typeof p.cropCode === "string" ? `Culture ${p.cropCode}` : null;
    case "HARVEST_DECLARED":
      return typeof p.quantityKg === "number" ? `${Math.round(p.quantityKg)} kg` : null;
    case "VERIFIED":
      return typeof p.outcome === "string"
        ? ({ CONFIRMED: "Confirmée", CORRECTED: "Corrigée", REJECTED: "Rejetée" }[p.outcome] ??
            null)
        : null;
    default:
      return null;
  }
}
