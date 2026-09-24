import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: readonly string[];
  current: number;
  className?: string;
}

// Indicateur d'avancement des formulaires multi-étapes : l'utilisateur voit toujours
// où il en est et combien il reste. Les étapes passées restent cliquables via le parent.
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Progression">
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-2"
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              className={cn(
                "tabular flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                state === "done" && "border-primary bg-primary text-primary-foreground",
                state === "current" && "border-primary text-primary",
                state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:block",
                state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px flex-1", index < current ? "bg-primary" : "bg-border")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
