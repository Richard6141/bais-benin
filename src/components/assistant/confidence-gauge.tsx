import { cn } from "@/lib/utils";

export type ConfidenceLevel = "sure" | "to_confirm" | "unreliable";

const LEVELS: Record<ConfidenceLevel, { filled: number; tone: string; bar: string }> = {
  sure: { filled: 3, tone: "text-success", bar: "bg-success" },
  to_confirm: { filled: 2, tone: "text-watch", bar: "bg-watch" },
  unreliable: { filled: 1, tone: "text-warning", bar: "bg-warning" },
};

interface ConfidenceGaugeProps {
  level: ConfidenceLevel;
  /** Libellé en mots fourni par le serveur (« Réponse sûre »). */
  words: string;
  className?: string;
}

// Jauge de confiance en mots (assistant-parcours-ux §0) : jamais un pourcentage seul. Trois
// segments pleins, deux ou un ; le libellé porte l'information, la couleur ne fait que la doubler.
export function ConfidenceGauge({ level, words, className }: ConfidenceGaugeProps) {
  const config = LEVELS[level];
  return (
    <p
      data-confidence-level={level}
      className={cn("flex items-center gap-2 text-sm font-medium", config.tone, className)}
    >
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn("h-2 w-5 rounded-full", index < config.filled ? config.bar : "bg-muted")}
          />
        ))}
      </span>
      <span>Confiance : {words}</span>
    </p>
  );
}
