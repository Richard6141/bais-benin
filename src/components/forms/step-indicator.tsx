import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: readonly string[];
  current: number;
  className?: string;
}

// Avancement d'un formulaire en plusieurs étapes, à la manière des démarches en ligne de
// l'administration : « Étape 2 sur 3 : Adresse » écrit en toutes lettres, puis une barre plate
// découpée en segments. Pas de pastilles numérotées décoratives.
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  const index = Math.min(Math.max(current, 0), steps.length - 1);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-sm">
        <span className="font-semibold">
          Étape {index + 1} sur {steps.length}
        </span>
        {steps[index] ? <span className="text-muted-foreground"> : {steps[index]}</span> : null}
      </p>
      <ol aria-label="Progression" className="flex gap-1">
        {steps.map((label, step) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={cn("h-1.5 flex-1", step <= index ? "bg-primary" : "bg-muted")}
          >
            <span className="sr-only">
              {label}
              {step < index ? " (terminée)" : step === index ? " (en cours)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
