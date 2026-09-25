"use client";

import { Check, Copy, Send, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_REASONS,
  shortForProducer,
  type FeedbackReason,
} from "./assistant-logic";
import { requestAgent, sendFeedback } from "./api-client";

// A3 : « Utile » / « Pas utile », avec un motif facultatif quand la réponse n'a pas aidé.
export function FeedbackControl({ messageId }: { messageId: string }) {
  const [state, setState] = useState<"idle" | "reason" | "sent">("idle");
  const [reason, setReason] = useState<FeedbackReason>("UNCLEAR");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(useful: boolean) {
    setError(null);
    const result = await sendFeedback({
      messageId,
      useful,
      ...(useful ? {} : { reason, comment: comment.trim() || undefined }),
    });
    if (result.ok) setState("sent");
    else setError(result.message);
  }

  if (state === "sent") {
    return (
      <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-success">
        <Check className="size-4" aria-hidden />
        Merci, votre avis aide à améliorer l&apos;assistant.
      </p>
    );
  }
  if (state === "reason") {
    return (
      <fieldset className="flex w-full flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Pourquoi cette réponse n&apos;aide pas ?
        </legend>
        <RadioGroup value={reason} onValueChange={(value) => setReason(value as FeedbackReason)}>
          {FEEDBACK_REASONS.map((option) => (
            <div key={option.value} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem value={option.value} id={`motif-${messageId}-${option.value}`} />
              <Label htmlFor={`motif-${messageId}-${option.value}`}>{option.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <Label htmlFor={`commentaire-${messageId}`}>Précisez si vous le souhaitez</Label>
        <Textarea
          id={`commentaire-${messageId}`}
          value={comment}
          maxLength={FEEDBACK_COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" className="h-11 self-start" onClick={() => void submit(false)}>
          <Send aria-hidden />
          Envoyer
        </Button>
      </fieldset>
    );
  }
  return (
    <>
      <Button type="button" variant="outline" className="h-11" onClick={() => void submit(true)}>
        <ThumbsUp aria-hidden />
        Utile
      </Button>
      <Button type="button" variant="outline" className="h-11" onClick={() => setState("reason")}>
        <ThumbsDown aria-hidden />
        Pas utile
      </Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </>
  );
}

// A4 : la question et la réponse sont transmises à l'agent de la commune.
export function AskAgentButton({ messageId }: { messageId: string }) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "no-agent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("pending");
    setError(null);
    const result = await requestAgent(messageId);
    if (!result.ok) {
      setState("idle");
      setError(result.message);
      return;
    }
    setState(result.data.agentAvailable ? "sent" : "no-agent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-success">
        <Check className="size-4" aria-hidden />
        Votre question est transmise à votre agent agricole.
      </p>
    );
  }
  if (state === "no-agent") {
    return (
      <p role="status" className="text-sm">
        Aucun agent n&apos;est affecté à votre commune pour l&apos;instant : adressez-vous au bureau
        de l&apos;ATDA de votre commune.
      </p>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-11"
        disabled={state === "pending"}
        onClick={() => void submit()}
      >
        <UserRound aria-hidden />
        Demander à mon agent
      </Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </>
  );
}

// B2 : réponse et conseil en texte court (160 caractères si possible), à envoyer au producteur
// par les moyens habituels de l'agent.
export function CopyForProducerButton({
  answer,
  advice,
}: {
  answer: string | null;
  advice: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const text = shortForProducer(answer, advice);
  if (!text) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="h-11" onClick={() => void copy()}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Texte copié" : "Copier pour le producteur"}
      <span className="sr-only">
        {" "}
        ({text.length} caractères) : {text}
      </span>
    </Button>
  );
}
