"use client";

import { Check, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTourProgress } from "./progress";
import { TOURS, stepLink, type TourRole } from "./steps";

// Carte « Premiers pas » d'un accueil d'espace : la suite des étapes du rôle, cochées au fil de
// la découverte, avec la progression. Chaque étape ouvre son écran et y désigne l'élément à
// toucher. Repliable ; une fois le tour fait, elle se réduit à une ligne.
export function FirstStepsCard({ role, userId }: { role: TourRole; userId: string }) {
  const steps = TOURS[role];
  const { progress, setHidden, reset } = useTourProgress(role, userId);
  if (!progress) return null;
  const done = new Set(progress.done);
  const count = steps.filter((step) => done.has(step.id)).length;
  const finished = count === steps.length;

  if (progress.hidden || finished) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {finished ? "Premiers pas terminés." : "Premiers pas masqués."}
        <button
          type="button"
          onClick={() => (finished ? reset() : setHidden(false))}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline md:min-h-0"
        >
          {finished ? "Recommencer le parcours" : "Afficher les premiers pas"}
        </button>
      </p>
    );
  }

  return (
    <section
      aria-labelledby="premiers-pas-titre"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="premiers-pas-titre" className="text-lg font-semibold">
            Premiers pas
          </h2>
          <p className="tabular text-sm text-muted-foreground">
            {count} étape{count > 1 ? "s" : ""} sur {steps.length}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          onClick={() => setHidden(true)}
        >
          Masquer
        </Button>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Progression des premiers pas"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={count}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(count / steps.length) * 100}%` }}
        />
      </div>
      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isDone = done.has(step.id);
          return (
            <li key={step.id}>
              <Link
                href={stepLink(step) as Route}
                className="flex min-h-12 items-center gap-3 rounded-sm px-1 py-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "tabular flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    isDone
                      ? "border-success bg-success text-white"
                      : "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {isDone ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("font-medium", isDone && "text-muted-foreground")}>
                    {step.title}
                    <span className="sr-only">{isDone ? ", fait" : ", à faire"}</span>
                  </span>
                  {!isDone ? (
                    <span className="text-sm text-muted-foreground">{step.why}</span>
                  ) : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
