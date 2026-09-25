import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConditionStatus = "MET" | "NOT_MET" | "UNKNOWN";

export interface ExplainedCondition {
  text: string;
  status: ConditionStatus;
}

const STATUS = {
  MET: { label: "remplie", Icon: CircleCheck, tone: "text-success" },
  NOT_MET: { label: "non remplie", Icon: CircleX, tone: "text-muted-foreground" },
  UNKNOWN: { label: "non évaluable", Icon: CircleHelp, tone: "text-watch" },
} as const;

const SUFFIX = /\s*\((remplie|non remplie|non évaluable)\)\.?\s*$/;

/**
 * Convertit les phrases produites par explainTrace (« … (remplie). ») en conditions structurées.
 * Le composant ne dépend pas du module monitoring : il ne lit que le texte.
 */
export function parseExplainedLines(lines: readonly string[]): ExplainedCondition[] {
  return lines.map((line) => {
    const match = line.match(SUFFIX);
    const status: ConditionStatus =
      match?.[1] === "remplie" ? "MET" : match?.[1] === "non remplie" ? "NOT_MET" : "UNKNOWN";
    const text = (match ? line.slice(0, match.index) : line).trim();
    return { text: text.endsWith(".") ? text : `${text}.`, status };
  });
}

interface IndicatorExplanationProps {
  conditions: readonly ExplainedCondition[];
  title?: string;
  className?: string;
}

// Pourquoi une alerte a été levée : chaque condition de la règle, avec son état en toutes lettres.
export function IndicatorExplanation({
  conditions,
  title = "Pourquoi cette alerte ?",
  className,
}: IndicatorExplanationProps) {
  const met = conditions.filter((c) => c.status === "MET").length;
  return (
    <section className={cn("flex flex-col gap-2", className)} aria-label={title}>
      <p className="text-sm font-semibold">
        {title}{" "}
        <span className="tabular font-normal text-muted-foreground">
          ({met} condition{met > 1 ? "s" : ""} remplie{met > 1 ? "s" : ""} sur {conditions.length})
        </span>
      </p>
      <ul className="flex flex-col gap-1.5">
        {conditions.map((condition, index) => {
          const { label, Icon, tone } = STATUS[condition.status];
          return (
            <li
              key={index}
              data-status={condition.status}
              className="flex items-start gap-2 text-sm"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <span>
                {condition.text} <span className={cn("font-medium", tone)}>{label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
