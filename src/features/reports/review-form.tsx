"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewReportAction, type ReviewActionState } from "./actions";

const initialState: ReviewActionState = { status: "idle" };

// Décision après la visite : confirmer (le problème est bien là) ou écarter, motif à l'appui.
export function ReviewForm({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(reviewReportAction, initialState);
  const [note, setNote] = useState("");

  if (state.status === "success") {
    return (
      <p role="status" className="font-medium">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="reportId" value={reportId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-note">Constat sur place</Label>
        <Textarea
          id="review-note"
          name="note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ce que vous avez constaté lors de la visite (obligatoire pour écarter)."
        />
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" name="decision" value="CONFIRMED" disabled={pending}>
          Confirmer le signalement
        </Button>
        <Button
          type="submit"
          name="decision"
          value="DISMISSED"
          variant="outline"
          disabled={pending}
        >
          Écarter le signalement
        </Button>
      </div>
    </form>
  );
}
