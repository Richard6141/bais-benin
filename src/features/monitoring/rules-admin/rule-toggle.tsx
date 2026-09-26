"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toggleRuleAction } from "./actions";

interface RuleToggleProps {
  code: string;
  name: string;
  enabled: boolean;
  critical: boolean;
}

// Interrupteur « Active » d'une règle (§2.C4). L'activation est immédiate ; la désactivation
// ouvre une fenêtre de motif, obligatoire avec confirmation pour une règle critique.
export function RuleToggle({ code, name, enabled, critical }: RuleToggleProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(nextEnabled: boolean, withReason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await toggleRuleAction({
        code,
        enabled: nextEnabled,
        reason: withReason,
        confirmed,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setReason("");
      setConfirmed(false);
    });
  }

  const reasonMissing = critical && reason.trim().length < 10;
  return (
    <>
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label={enabled ? `Désactiver la règle ${name}` : `Activer la règle ${name}`}
        onCheckedChange={(checked) => (checked ? run(true) : setOpen(true))}
      />
      {error && !open ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver « {name} » ?</DialogTitle>
            <DialogDescription>
              Plus aucune alerte de ce type ne sera levée tant que la règle reste désactivée. Les
              alertes déjà en cours ne sont pas levées.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`motif-${code}`}>
              Motif{critical ? " (obligatoire, 10 caractères au moins)" : " (facultatif)"}
            </Label>
            <Textarea
              id={`motif-${code}`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {critical ? (
            <div className="flex items-start gap-3">
              <Checkbox
                id={`confirm-${code}`}
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              <Label htmlFor={`confirm-${code}`} className="font-normal">
                Je confirme la désactivation d&apos;une règle d&apos;alerte grave.
              </Label>
            </div>
          ) : null}
          {error ? (
            <Alert variant="critical">
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reasonMissing || (critical && !confirmed)}
              onClick={() => run(false, reason.trim() || undefined)}
            >
              {pending ? "Désactivation en cours" : "Désactiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
