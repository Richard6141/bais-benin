"use client";

import { startTransition, useActionState, useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionFeedback } from "./action-feedback";
import { sendGroupMessageAction, type GroupActionState } from "./actions";

const initialState: GroupActionState = { status: "idle" };

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function Recipients({ members, consented }: { members: number; consented: number }) {
  if (consented === 0) {
    return (
      <p className="text-sm">
        Aucun membre n&apos;a donné son accord WhatsApp : ce groupe ne peut pas recevoir de message.
      </p>
    );
  }
  return (
    <p className="text-sm">
      <strong>
        {plural(consented, "membre")} sur {members}
      </strong>{" "}
      {consented > 1
        ? "ont donné leur accord WhatsApp : eux seuls recevront ce message."
        : "a donné son accord WhatsApp : lui seul recevra ce message."}
    </p>
  );
}

// Message WhatsApp aux membres d'un groupe : qui le recevra est dit avant l'envoi. Le champ est
// remonté (clé) après un envoi réussi pour repartir vide ; un envoi refusé garde le texte.
export function MessageComposer({
  groupId,
  members,
  consented,
  demo,
  maxLength,
}: {
  groupId: string;
  members: number;
  /** Membres dont l'accord WhatsApp est en cours. */
  consented: number;
  /** Parmi eux, fiches de démonstration : jamais de vrai message. */
  demo: number;
  maxLength: number;
}) {
  const [state, action, pending] = useActionState(sendGroupMessageAction, initialState);
  const fieldKey = state.status === "success" ? String(state.sentAt ?? 0) : "brouillon";
  const [draft, setDraft] = useState({ key: fieldKey, length: 0 });
  const length = draft.key === fieldKey ? draft.length : 0;

  return (
    <section
      aria-labelledby="ecrire-membres"
      className="flex flex-col gap-3 rounded-sm border p-4 print:hidden"
    >
      <div className="flex items-center gap-1">
        <h2 id="ecrire-membres" className="text-lg font-semibold">
          Écrire aux membres
        </h2>
        <HelpTip label="Message WhatsApp aux membres">
          Le message part du numéro officiel, signé « BAIS, ministère de l&apos;Agriculture ».
          L&apos;accord est revérifié au moment de l&apos;envoi. Envoi par vagues, jamais entre 21 h
          et 6 h. Pas de lien ni d&apos;adresse e-mail.
        </HelpTip>
      </div>
      <div className="flex flex-col gap-1">
        <Recipients members={members} consented={consented} />
        {demo > 0 ? (
          <p className="text-sm text-muted-foreground">
            Parmi eux, {plural(demo, "fiche")} de démonstration :{" "}
            {demo > 1 ? "elles ne reçoivent" : "elle ne reçoit"} jamais de vrai message.
          </p>
        ) : null}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="message-groupe">Message</Label>
            <span
              id="message-groupe-compteur"
              className="tabular text-xs text-muted-foreground"
              aria-live="polite"
            >
              {length} / {maxLength}
            </span>
          </div>
          <Textarea
            key={fieldKey}
            id="message-groupe"
            name="text"
            rows={4}
            maxLength={maxLength}
            required
            disabled={consented === 0}
            aria-describedby="message-groupe-compteur"
            onChange={(event) => setDraft({ key: fieldKey, length: event.target.value.length })}
          />
        </div>
        <ActionFeedback state={state} />
        <div>
          <Button
            type="submit"
            className="h-11"
            disabled={pending || consented === 0 || length === 0}
          >
            {consented > 0 ? `Envoyer à ${plural(consented, "membre")}` : "Envoyer"}
          </Button>
        </div>
      </form>
    </section>
  );
}
