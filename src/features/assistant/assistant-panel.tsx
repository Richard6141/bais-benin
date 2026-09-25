"use client";

import { History, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { ListenButton } from "@/components/assistant/listen-button";
import { SuggestionChips } from "@/components/assistant/suggestion-chips";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantReply } from "@/modules/assistant";
import { AnswerCard } from "./answer-card";
import { askAssistant } from "./api-client";
import { QUESTION_MAX, questionState, speechText, type Audience } from "./assistant-logic";
import { FarmPicker, type FarmOption } from "./farm-picker";
import { AskAgentButton, CopyForProducerButton, FeedbackControl } from "./reply-actions";

interface AssistantPanelProps {
  audience: Audience;
  suggestions: readonly string[];
  /** Dernières questions de l'utilisateur (producteur), posables de nouveau d'un toucher. */
  history?: readonly { id: string; content: string }[];
  /** Exploitations du périmètre (agent). */
  farms?: readonly FarmOption[];
  initialFarmCode?: string | null;
}

interface Exchange {
  question: string;
  reply: AssistantReply;
}

const OFFLINE_MESSAGE =
  "L'assistant a besoin du réseau. Votre question reste dans le champ : envoyez-la dès le retour du réseau.";

// A1-A2, B1-B2, C1 : composer une question (ou toucher une suggestion), lire les réponses, de la
// plus récente à la plus ancienne, dans la même conversation.
export function AssistantPanel({
  audience,
  suggestions,
  history = [],
  farms,
  initialFarmCode = null,
}: AssistantPanelProps) {
  const [question, setQuestion] = useState("");
  const [farmCode, setFarmCode] = useState<string | null>(initialFarmCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const state = questionState(question);
  const farmer = audience === "farmer";

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > QUESTION_MAX || pending) return;
    setError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setQuestion(text);
      setError(OFFLINE_MESSAGE);
      return;
    }
    setPending(true);
    const result = await askAssistant({
      question: trimmed,
      farmCode: farmCode ?? undefined,
      conversationId,
    });
    setPending(false);
    if (!result.ok) {
      setQuestion(text);
      setError(result.message);
      return;
    }
    // Service indisponible : la question reste saisie pour être renvoyée (A2, erreurs).
    setQuestion(result.data.outcome === "PROVIDER_ERROR" ? text : "");
    setConversationId(result.data.conversationId);
    setExchanges((current) => [{ question: trimmed, reply: result.data }, ...current]);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        {farms ? <FarmPicker farms={farms} value={farmCode} onChange={setFarmCode} /> : null}
        <Label htmlFor="question" className={farmer ? "text-base" : undefined}>
          Votre question
        </Label>
        <Textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(question);
            }
          }}
          rows={2}
          aria-describedby="question-compteur"
          placeholder={
            farmer ? "Par exemple : quand semer le maïs ?" : "Posez une question agricole"
          }
          className={farmer ? "min-h-20 text-base" : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            id="question-compteur"
            className={state.tooLong ? "text-sm text-destructive" : "text-xs text-muted-foreground"}
          >
            {state.tooLong
              ? `${-state.remaining} caractères de trop (${QUESTION_MAX} au plus)`
              : `${state.remaining} caractères restants`}
          </p>
          <Button
            type="submit"
            disabled={!state.canSend || pending}
            className={farmer ? "h-14 w-full px-6 text-base sm:w-auto" : "h-11"}
          >
            <SendHorizontal aria-hidden />
            {pending ? "Recherche dans les fiches…" : "Envoyer"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {exchanges.length === 0 ? (
        <SuggestionChips
          suggestions={suggestions}
          onPick={(text) => void ask(text)}
          disabled={pending}
        />
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-4">
        {exchanges.map(({ question: asked, reply }) => (
          <AnswerCard
            key={reply.messageId}
            question={asked}
            reply={reply}
            actions={
              <>
                <ListenButton text={speechText(reply)} />
                {reply.outcome === "ANSWERED" ? (
                  <FeedbackControl messageId={reply.messageId} />
                ) : null}
                {farmer && (reply.outcome === "ANSWERED" || reply.outcome === "LOW_CONFIDENCE") ? (
                  <AskAgentButton messageId={reply.messageId} />
                ) : null}
                {audience === "agent" && reply.outcome === "ANSWERED" ? (
                  <CopyForProducerButton answer={reply.answer} advice={reply.advice} />
                ) : null}
              </>
            }
          />
        ))}
      </div>

      {exchanges.length > 0 ? (
        <SuggestionChips
          suggestions={suggestions}
          onPick={(text) => void ask(text)}
          disabled={pending}
          label="Autres questions suggérées"
        />
      ) : null}

      {history.length > 0 ? (
        <section aria-labelledby="historique-titre" className="flex flex-col gap-2">
          <h2 id="historique-titre" className="flex items-center gap-2 text-base font-semibold">
            <History className="size-4" aria-hidden />
            Vos dernières questions
          </h2>
          <ul className="flex flex-col gap-1">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void ask(item.content)}
                  className="min-h-11 w-full rounded-md px-2 text-left text-sm text-primary underline-offset-4 hover:underline"
                >
                  {item.content}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
