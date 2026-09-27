"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_KINDS,
  KIND_LABELS,
  MESSAGE_MAX,
  type FeedbackKind,
} from "@/modules/feedback/rules";
import { submitFeedbackAction, type FeedbackActionState } from "./actions";

const INITIAL: FeedbackActionState = { status: "idle" };
const count = new Intl.NumberFormat("fr-FR");

/** Type d'écran au moment de l'avis, d'après la largeur (seuil des onglets : 768 px). */
function currentDevice(): "MOBILE" | "DESKTOP" {
  if (typeof window === "undefined") return "DESKTOP";
  const narrow =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 767px)").matches
      : window.innerWidth < 768;
  return narrow ? "MOBILE" : "DESKTOP";
}

// Avis d'un testeur (chantier J) : trois choix, un message, une note facultative. La page, le
// rôle, la date et le type d'écran partent avec l'avis sans être montrés ; les numéros écrits dans
// le message sont masqués par le serveur. Après l'envoi, un accusé de réception clair, puis retour
// à la page.
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* Fermée, la fenêtre démonte le formulaire : chaque ouverture repart de zéro. */}
        {open ? <FeedbackForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(submitFeedbackAction, INITIAL);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [page] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));
  const [device] = useState(currentDevice);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-start gap-3" role="status">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <DialogHeader className="text-left">
          <DialogTitle>Merci, votre avis est bien reçu</DialogTitle>
          <DialogDescription>
            L&apos;équipe du ministère le lira. Vous pouvez reprendre là où vous étiez.
          </DialogDescription>
        </DialogHeader>
        <Button className="h-11" onClick={onDone}>
          Revenir à la page
        </Button>
      </div>
    );
  }

  const ready = kind !== null && message.trim().length >= 3;
  return (
    <form action={action} className="flex flex-col gap-4">
      <DialogHeader className="text-left">
        <div className="flex items-center gap-1">
          <DialogTitle>Donner mon avis</DialogTitle>
          <HelpTip label="Ce qui part avec l'avis">
            La page où vous êtes, votre rôle, la date et le type d&apos;écran (téléphone ou
            ordinateur) sont ajoutés. Aucune capture d&apos;écran. Les numéros de téléphone et NPI
            écrits dans le message sont masqués.
          </HelpTip>
        </div>
        <DialogDescription>Ce que vous en pensez, en quelques mots.</DialogDescription>
      </DialogHeader>

      <input type="hidden" name="kind" value={kind ?? ""} />
      <input type="hidden" name="rating" value={rating ?? ""} />
      <input type="hidden" name="pagePath" value={page} />
      <input type="hidden" name="device" value={device} />

      <div className="grid gap-2" role="group" aria-label="Type d'avis">
        {FEEDBACK_KINDS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={kind === choice}
            onClick={() => setKind(choice)}
            className={cn(
              "flex min-h-12 items-center rounded-lg border-2 px-4 py-2 text-left text-sm font-semibold transition-colors",
              kind === choice
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent",
            )}
          >
            {KIND_LABELS[choice]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="feedback-message">Votre message</Label>
        <Textarea
          id="feedback-message"
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MESSAGE_MAX}
          rows={4}
          required
        />
        <p className="self-end text-xs text-muted-foreground">
          {count.format(message.length)} sur {count.format(MESSAGE_MAX)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium" id="feedback-rating">
          Note (facultative)
        </span>
        <div className="flex gap-2" role="group" aria-labelledby="feedback-rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              aria-label={`${value} sur 5`}
              onClick={() => setRating(rating === value ? null : value)}
              className={cn(
                "flex size-11 items-center justify-center rounded-lg border-2 text-sm font-semibold",
                rating === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {state.status === "error" ? (
        <Alert variant="critical" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" className="h-11 flex-1" disabled={!ready || pending}>
          {pending ? "Envoi en cours" : "Envoyer"}
        </Button>
      </div>
    </form>
  );
}
