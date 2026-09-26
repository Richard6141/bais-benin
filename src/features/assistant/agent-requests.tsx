"use client";

import { Check } from "lucide-react";
import { useState } from "react";
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

// B3 : une question transmise par un producteur depuis l'assistant (« Demander à mon agent »).
// L'agent répond par ses moyens habituels puis marque la demande traitée ; aucun nom ni téléphone
// de producteur n'apparaît ici. Affichée dans la boîte des demandes de l'agent (/agent/demandes).
export function AgentQuestionBody({ request }: { request: AgentRequestView }) {
  const [handled, setHandled] = useState(request.status === "HANDLED");
  const [error, setError] = useState<string | null>(null);

  async function markDone() {
    setError(null);
    const result = await markRequestHandled(request.id);
    if (result.ok) setHandled(true);
    else setError(result.message);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Question à l&apos;agent</span>
        <Badge variant={handled ? "success" : "watch"}>{handled ? "Traitée" : "À traiter"}</Badge>
      </div>
      <p className="text-sm whitespace-pre-line">{request.question}</p>
      <p className="text-sm text-muted-foreground">
        Reçue le {request.createdAt}, {request.communeName}
      </p>
      {request.answer ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Réponse de l&apos;assistant : </span>
          {request.answer}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {handled ? null : (
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start"
          onClick={() => void markDone()}
        >
          <Check aria-hidden />
          Marquer traitée
        </Button>
      )}
    </>
  );
}
