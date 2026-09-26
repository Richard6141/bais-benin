"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "./action-feedback";
import { archiveGroupAction, type GroupActionState } from "./actions";

const initialState: GroupActionState = { status: "idle" };

// Archivage en deux temps : un clic de trop ne ferme pas un groupe par mégarde.
export function ArchiveGroupButton({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(archiveGroupAction, initialState);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="h-11" onClick={() => setConfirming(true)}>
        Archiver le groupe
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <p className="text-sm">
        Le groupe restera consultable mais ne pourra plus recevoir de message.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" className="h-11" disabled={pending}>
          Confirmer l&apos;archivage
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
