"use client";

import { FileBadge, Printer } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { issueAttestationAction, type AttestationActionState } from "./actions";

// Commandes de la page d'attestation : établir une attestation à jour, imprimer ou enregistrer en
// PDF (par la boîte d'impression du navigateur). Masquées à l'impression.

const INITIAL: AttestationActionState = { status: "idle" };

export function AttestationControls({
  farmId,
  path,
  hasAttestation,
}: {
  farmId: string;
  path: string;
  hasAttestation: boolean;
}) {
  const [state, action, pending] = useActionState(issueAttestationAction, INITIAL);
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="farmId" value={farmId} />
          <input type="hidden" name="path" value={path} />
          <Button type="submit" className="h-11" disabled={pending}>
            <FileBadge aria-hidden />
            {pending
              ? "Établissement en cours"
              : hasAttestation
                ? "Établir une attestation à jour"
                : "Établir mon attestation"}
          </Button>
        </form>
        {hasAttestation ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimer ou enregistrer en PDF
          </Button>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-critical">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
