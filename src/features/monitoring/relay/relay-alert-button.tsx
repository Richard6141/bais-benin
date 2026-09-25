"use client";

import { Megaphone } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getAgentDatabase } from "@/lib/offline/db";
import { getDeviceId } from "@/lib/offline/device-id";
import { enqueueCommand } from "@/lib/offline/outbox";
import { syncOnce } from "@/lib/offline/sync-runner";

export const RELAY_MODE_LABELS = {
  CALL: "Appel téléphonique",
  VISIT: "Visite sur place",
  GROUP_MEETING: "Réunion de groupement",
} as const;
export type RelayModeCode = keyof typeof RELAY_MODE_LABELS;

interface RelayAlertButtonProps {
  /** Compte de l'agent connecté : la file d'attente locale lui est propre. */
  userId: string;
  alertId: string;
  farmId: string;
  /** Nom du producteur ou code de l'exploitation, affiché dans le titre. */
  farmLabel: string;
  /** Déjà relayée : le bouton affiche l'état au lieu de l'action. */
  relayed?: boolean;
  onRelayed?: () => void;
}

type Stage = "idle" | "saving" | "queued" | "sent";

// Relais oral d'une alerte (monitoring-parcours-ux §2.B, B3) : feuille en bas d'écran, trois
// modes, une note facultative. La saisie devient une commande `alert.relay` de l'outbox : elle
// fonctionne sans réseau et part à la prochaine synchronisation, lancée tout de suite si possible.
export function RelayAlertButton({
  userId,
  alertId,
  farmId,
  farmLabel,
  relayed,
  onRelayed,
}: RelayAlertButtonProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RelayModeCode>("CALL");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<Stage>(relayed ? "sent" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setStage("saving");
    setError(null);
    try {
      const id = crypto.randomUUID();
      const db = getAgentDatabase(userId);
      await enqueueCommand(db, {
        id,
        type: "alert.relay",
        payload: {
          id,
          alertId,
          farmId,
          mode,
          note: note.trim() || undefined,
          relayedAt: new Date().toISOString(),
        },
      });
      setStage("queued");
      onRelayed?.();
      if (navigator.onLine) {
        const outcome = await syncOnce(userId, db, { deviceId: getDeviceId() });
        if (outcome && !outcome.error) setStage("sent");
      }
      setOpen(false);
    } catch (cause) {
      setStage("idle");
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    }
  }

  if (stage === "sent" || stage === "queued") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {stage === "sent" ? "Relais enregistré" : "Relais enregistré, envoi au retour du réseau"}
      </p>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11">
          <Megaphone aria-hidden />
          J&apos;ai prévenu
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Alerte relayée à {farmLabel}</SheetTitle>
          <SheetDescription>Indiquez comment vous avez prévenu le producteur.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as RelayModeCode)}
            aria-label="Mode de relais"
          >
            {(Object.keys(RELAY_MODE_LABELS) as RelayModeCode[]).map((code) => (
              <div key={code} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem value={code} id={`relais-${farmId}-${code}`} />
                <Label htmlFor={`relais-${farmId}-${code}`} className="text-base font-normal">
                  {RELAY_MODE_LABELS[code]}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`relais-note-${farmId}`}>Note (facultatif)</Label>
            <Textarea
              id={`relais-note-${farmId}`}
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Par exemple : a déjà paillé ses semis."
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {error ? (
            <Alert variant="critical">
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            className="h-12 w-full text-base"
            disabled={stage === "saving"}
            onClick={() => void submit()}
          >
            {stage === "saving" ? "Enregistrement…" : "Enregistrer le relais"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
