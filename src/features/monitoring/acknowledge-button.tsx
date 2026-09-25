"use client";

import { CheckCheck } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acknowledgeAlertAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

interface AcknowledgeButtonProps {
  alertId: string;
  readAt: string | null;
  /** Enregistre la lecture dès l'ouverture de la fiche (A2), sans attendre le bouton. */
  markOnOpen?: boolean;
}

// « J'ai compris » : la lecture est déjà enregistrée à l'ouverture ; le bouton confirme à
// l'agriculteur qu'il a bien pris connaissance et referme la boucle côté ministère.
export function AcknowledgeButton({ alertId, readAt, markOnOpen = true }: AcknowledgeButtonProps) {
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(readAt);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sentRef = useRef(false);

  function send(onDone?: () => void) {
    startTransition(async () => {
      const result = await acknowledgeAlertAction(alertId);
      if (result.ok) {
        setAcknowledgedAt((current) => current ?? result.acknowledgedAt);
        setError(null);
        onDone?.();
      } else {
        setError(result.message);
      }
    });
  }

  useEffect(() => {
    if (!markOnOpen || acknowledgedAt || sentRef.current) return;
    sentRef.current = true;
    send();
    // Envoi unique à l'ouverture de la fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (confirmed) {
    return (
      <p role="status" className="flex items-center gap-2 text-lg font-medium text-success">
        <CheckCheck aria-hidden className="size-5" />
        Merci, c&apos;est noté.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={pending}
        aria-busy={pending}
        onClick={() => send(() => setConfirmed(true))}
      >
        J&apos;ai compris
      </Button>
      {acknowledgedAt ? (
        <p className="text-sm text-muted-foreground">
          Lu le {dateFormatter.format(new Date(acknowledgedAt))}
        </p>
      ) : null}
      {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
    </div>
  );
}
