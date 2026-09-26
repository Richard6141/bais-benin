"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistanceStatus } from "@/modules/assistance";
import { handleAssistanceAction, type HandleActionState } from "./actions";

const initialState: HandleActionState = { status: "idle" };

// Actions de l'agent sur une demande : la prendre en charge, puis la résoudre avec la réponse
// donnée au producteur (obligatoire, il la lira dans son espace).
export function HandleForm({ requestId, status }: { requestId: string; status: AssistanceStatus }) {
  const [state, action, pending] = useActionState(handleAssistanceAction, initialState);
  const [note, setNote] = useState("");

  if (state.status === "success") {
    return (
      <p role="status" className="text-sm font-medium">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`note-${requestId}`}>Réponse au producteur</Label>
        <Textarea
          id={`note-${requestId}`}
          name="note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ce qui a été fait ou décidé (obligatoire pour résoudre)."
        />
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {status === "RECEIVED" ? (
          <Button type="submit" name="step" value="TAKE" variant="outline" disabled={pending}>
            Prendre en charge
          </Button>
        ) : null}
        <Button type="submit" name="step" value="RESOLVE" disabled={pending}>
          Marquer résolue
        </Button>
      </div>
    </form>
  );
}
