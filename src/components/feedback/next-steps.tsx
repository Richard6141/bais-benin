"use client";

import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface NextStep {
  label: string;
  /** Page où mène l'étape ; sans adresse, l'étape est une action sur place (onClick). */
  href?: Route;
  onClick?: () => void;
}

interface NextStepsProps {
  /** Première étape en bouton plein : la suite la plus probable. */
  steps: readonly NextStep[];
  className?: string;
}

// Suite proposée après un envoi : jamais d'impasse, un formulaire envoyé dit ce qu'on peut faire
// ensuite (suivre ce qu'on vient d'envoyer, recommencer, revenir à l'accueil). La première étape est
// la plus probable ; les autres restent discrètes.
export function NextSteps({ steps, className }: NextStepsProps) {
  return (
    <nav aria-label="Suite" className={className}>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {steps.map((step, index) => {
          const variant = index === 0 ? "default" : "outline";
          return (
            <li key={step.label}>
              {step.href ? (
                <Button asChild variant={variant} className="h-11 w-full sm:w-auto">
                  <Link href={step.href}>{step.label}</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={variant}
                  className="h-11 w-full sm:w-auto"
                  onClick={step.onClick}
                >
                  {step.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
