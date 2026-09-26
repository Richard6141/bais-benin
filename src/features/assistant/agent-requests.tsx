"use client";

import { Check, Inbox } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markRequestHandled } from "./api-client";

export interface AgentRequestView {
  id: string;
  status: "OPEN" | "HANDLED";
  communeName: string;
  question: string;
  answer: string;
  /** Date déjà formatée côté serveur (fuseau de Porto-Novo). */
  createdAt: string;
}

// B3 : demandes transmises par les producteurs de ses communes (« Demander à mon agent »), non
// traitées d'abord. L'agent répond par ses moyens habituels puis marque la demande traitée ;
// aucun nom ni téléphone de producteur n'apparaît ici.
export function AgentRequests({ requests }: { requests: readonly AgentRequestView[] }) {
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Aucune demande de producteur"
        description="Quand un producteur de vos communes transmet une question, elle apparaît ici."
      />
    );
  }

  async function markDone(id: string) {
    setError(null);
    const result = await markRequestHandled(id);
    if (result.ok) setHandled((current) => new Set(current).add(id));
    else setError(result.message);
  }

  const sorted = [...requests].sort(
    (a, b) => Number(a.status === "HANDLED") - Number(b.status === "HANDLED"),
  );
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul aria-label="Demandes des producteurs" className="flex flex-col gap-3">
        {sorted.map((request) => {
          const done = request.status === "HANDLED" || handled.has(request.id);
          return (
            <li key={request.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={done ? "success" : "watch"}>{done ? "Traitée" : "À traiter"}</Badge>
                <span>
                  {request.communeName} ({request.createdAt})
                </span>
              </div>
              <p className="font-medium">{request.question}</p>
              {request.answer ? (
                <p className="text-sm text-muted-foreground">
                  Réponse de l&apos;assistant : {request.answer}
                </p>
              ) : null}
              {done ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 self-start"
                  onClick={() => void markDone(request.id)}
                >
                  <Check aria-hidden />
                  Marquer traitée
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
