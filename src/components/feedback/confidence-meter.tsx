import { cn } from "@/lib/utils";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

const levels: Record<
  ConfidenceLevel,
  { label: string; steps: number; tone: string; help: string }
> = {
  HIGH: {
    label: "Confiance élevée",
    steps: 4,
    tone: "bg-success",
    help: "Réponse appuyée sur plusieurs passages concordants du corpus documentaire.",
  },
  MEDIUM: {
    label: "Confiance moyenne",
    steps: 3,
    tone: "bg-info",
    help: "Réponse appuyée sur au moins une source, à recouper avant décision.",
  },
  LOW: {
    label: "Confiance faible",
    steps: 2,
    tone: "bg-watch",
    help: "Sources partielles ou anciennes : à confirmer auprès d'un agent.",
  },
  INSUFFICIENT: {
    label: "Information insuffisante",
    steps: 1,
    tone: "bg-critical",
    help: "Aucune source fiable : l'assistant ne formule pas de recommandation.",
  },
};

interface ConfidenceMeterProps {
  level: ConfidenceLevel;
  // Score numérique optionnel (0 à 1) affiché aux utilisateurs avancés.
  score?: number;
  className?: string;
}

// Jauge à quatre niveaux affichée sous chaque réponse de l'assistant.
// Le libellé et l'explication sont toujours présents : la couleur seule ne suffit pas.
export function ConfidenceMeter({ level, score, className }: ConfidenceMeterProps) {
  const config = levels[level];
  const percent = score === undefined ? undefined : Math.round(score * 100);

  return (
    <div
      className={cn("flex flex-col gap-1.5 text-sm", className)}
      role="meter"
      aria-label={`Niveau de confiance : ${config.label}`}
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={config.steps}
      aria-valuetext={config.label}
      data-confidence={level}
    >
      <div className="flex items-center gap-3">
        <div className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                "h-2 w-5 rounded-sm",
                step <= config.steps ? config.tone : "bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
        <span className="font-medium">{config.label}</span>
        {percent !== undefined ? (
          <span className="tabular text-xs text-muted-foreground">{percent} %</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{config.help}</p>
    </div>
  );
}
