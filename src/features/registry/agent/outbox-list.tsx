"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAgentDatabase, type OutboxEntry } from "@/lib/offline/db";
import { discardCommands, retryCommands } from "@/lib/offline/outbox";
import { COMMAND_LABELS, OUTBOX_STATUS_LABELS, formatDateTime } from "./labels";

interface OutboxListProps {
  userId: string;
  // Limite l'affichage aux commandes d'une exploitation (onglet Activité de la fiche).
  farmId?: string;
}

const STATUS_VARIANTS: Record<
  OutboxEntry["status"],
  "outline" | "info" | "success" | "warning" | "critical"
> = {
  PENDING: "outline",
  SENDING: "info",
  APPLIED: "success",
  DUPLICATE: "success",
  REJECTED: "critical",
  CONFLICT: "warning",
};

export function farmIdOf(entry: OutboxEntry): string | null {
  const payload = entry.payload as Record<string, unknown> | null;
  if (!payload) return null;
  if (entry.type === "farm.create" && typeof payload.id === "string") return payload.id;
  if (typeof payload.farmId === "string") return payload.farmId;
  return null;
}

// File de synchronisation : chaque commande avec son état, son erreur en français et les
// actions possibles. Jamais de trace technique (docs/modules/registre-parcours-ux.md §3.2).
export function OutboxList({ userId, farmId }: OutboxListProps) {
  const db = getAgentDatabase(userId);
  const entries = useLiveQuery(
    async () => {
      const all = await db.outbox.orderBy("sequence").reverse().toArray();
      return farmId ? all.filter((entry) => farmIdOf(entry) === farmId) : all;
    },
    [db, farmId],
    [],
  );

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Rien à synchroniser"
        description="Vos saisies apparaîtront ici jusqu'à leur enregistrement sur le serveur."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const failed = entry.status === "REJECTED" || entry.status === "CONFLICT";
        return (
          <li key={entry.id}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{COMMAND_LABELS[entry.type]}</span>
                <Badge variant={STATUS_VARIANTS[entry.status]}>
                  {OUTBOX_STATUS_LABELS[entry.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Saisie le {formatDateTime(entry.clientCreatedAt)}
                {entry.attempts > 0
                  ? `, ${entry.attempts} envoi${entry.attempts > 1 ? "s" : ""}`
                  : ""}
              </p>
              {entry.lastError ? (
                <p className="text-sm text-critical" role="status">
                  {entry.lastError.message}
                </p>
              ) : null}
              {entry.status === "CONFLICT" ? <ConflictSummary result={entry.serverResult} /> : null}
              {failed ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void retryCommands(db, [entry.id])}
                  >
                    <RotateCcw aria-hidden />
                    Réessayer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void discardCommands(db, [entry.id])}
                  >
                    <Trash2 aria-hidden />
                    Abandonner
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

// Conflit de version : la version serveur des champs divergents, en clair.
function ConflictSummary({ result }: { result: unknown }) {
  const conflict = (
    result as { conflict?: { serverVersion: number; fields: Record<string, unknown> } } | undefined
  )?.conflict;
  if (!conflict) return null;
  return (
    <div className="rounded-md bg-muted p-3 text-sm">
      <p className="font-medium">
        Modifiée ailleurs depuis votre saisie (version {conflict.serverVersion}).
      </p>
      <ul className="mt-1 text-muted-foreground">
        {Object.entries(conflict.fields).map(([field, value]) => (
          <li key={field}>
            {field} : {String(value ?? "—")}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        « Réessayer » renvoie votre saisie telle quelle ; ouvrez la fiche pour reprendre la version
        enregistrée.
      </p>
    </div>
  );
}
