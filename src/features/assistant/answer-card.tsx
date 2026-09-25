"use client";

import { Info, Lightbulb } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConfidenceGauge } from "@/components/assistant/confidence-gauge";
import { SourceList } from "@/components/assistant/source-list";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AssistantReply } from "@/modules/assistant";
import { visibleNotice } from "./assistant-logic";

interface AnswerCardProps {
  question: string;
  reply: AssistantReply;
  /** Boutons d'action sous la réponse (écouter, retour, demander à l'agent, copier). */
  actions?: ReactNode;
}

const shortDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

function IndicatorBlock({ indicator }: { indicator: NonNullable<AssistantReply["indicator"]> }) {
  const date = shortDate.format(new Date(indicator.generatedAt));
  if (!indicator.available) {
    return (
      <Alert variant="info">
        <Info aria-hidden />
        <AlertTitle>{indicator.title}</AlertTitle>
        <AlertDescription>
          <p>Cet indicateur n&apos;est pas encore disponible dans l&apos;assistant.</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <section aria-label={indicator.title} className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{indicator.title}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {indicator.figures.map((figure) => (
          <StatTile
            key={figure.label}
            label={figure.label}
            // Chiffres lus dans le registre et le monitoring, jamais écrits par le modèle.
            value={figure.value === null ? "moins de 5" : figure.value}
            unit={figure.value === null ? undefined : (figure.unit ?? undefined)}
            source={figure.value === null ? "Secret statistique" : indicator.source}
            sourceDate={date}
          />
        ))}
      </div>
      <Button asChild variant="outline" className="h-11 self-start">
        <Link href={indicator.href as Route}>Ouvrir dans le tableau de bord</Link>
      </Button>
    </section>
  );
}

// A2, B2, C1 : la réponse courte, le conseil, la jauge de confiance en mots et les sources
// repliées. Sous le seuil, hors sujet ou sans source : le message du serveur, sans sources.
export function AnswerCard({ question, reply, actions }: AnswerCardProps) {
  const answered = reply.outcome === "ANSWERED";
  const notice = visibleNotice(reply);
  return (
    <article
      aria-label={`Réponse à : ${question}`}
      data-outcome={reply.outcome}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card sm:p-5"
    >
      {reply.demonstration ? (
        <Alert variant="info">
          <Info aria-hidden />
          <AlertTitle>Données de démonstration</AlertTitle>
          <AlertDescription>
            <p>
              Le modèle de démonstration recopie des passages de fiches rédigées par l&apos;équipe,
              sans rien rédiger lui-même.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Votre question :</span> {question}
      </p>

      {reply.farmCode ? (
        <p className="text-sm">
          Pour l&apos;exploitation <span className="font-mono">{reply.farmCode}</span>
        </p>
      ) : null}

      {reply.facts.length > 0 ? (
        <ul
          aria-label="Ce que l'assistant sait de votre situation"
          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
        >
          {reply.facts.map((fact) => (
            <li key={fact.text} className="flex flex-col text-sm">
              <span>{fact.text}</span>
              <SourceCaption source={fact.source} />
            </li>
          ))}
        </ul>
      ) : null}

      {answered && reply.answer ? (
        <>
          <p className="text-lg leading-relaxed">{reply.answer}</p>
          {reply.advice ? (
            <div className="flex gap-3 rounded-lg bg-gulf-soft p-3 dark:bg-muted">
              <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <p className="text-base">
                <span className="font-semibold">Conseil : </span>
                {reply.advice}
              </p>
            </div>
          ) : null}
          {reply.confidenceLabel && reply.confidenceWords ? (
            <ConfidenceGauge level={reply.confidenceLabel} words={reply.confidenceWords} />
          ) : null}
        </>
      ) : notice ? (
        <Alert variant={reply.outcome === "PROVIDER_ERROR" ? "warning" : "watch"}>
          <AlertDescription>
            <p className="text-base">{notice}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {reply.indicator ? <IndicatorBlock indicator={reply.indicator} /> : null}

      {answered ? <SourceList sources={reply.sources} /> : null}

      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}
