import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GpsPrecisionHintProps {
  accuracyM: number | null | undefined;
  className?: string;
}

// Seuils issus de la spécification du registre (docs/modules/registre-parcours-ux.md §3.2) :
// sous 10 m un contour de parcelle est exploitable, entre 10 et 30 m une position de siège
// reste acceptable, au-delà l'agent doit sortir à découvert. Le texte porte toujours le sens,
// la couleur ne fait que l'appuyer.
export function describeAccuracy(accuracyM: number) {
  if (accuracyM <= 10) {
    return { level: "GOOD", variant: "success", text: "Précision bonne" } as const;
  }
  if (accuracyM <= 30) {
    return {
      level: "MEDIUM",
      variant: "watch",
      text: "Précision moyenne, attendez quelques secondes si possible",
    } as const;
  }
  return {
    level: "LOW",
    variant: "warning",
    text: "Précision faible, sortez à découvert",
  } as const;
}

export function GpsPrecisionHint({ accuracyM, className }: GpsPrecisionHintProps) {
  // La zone vit dès le rendu initial pour que les lecteurs d'écran annoncent les changements.
  if (accuracyM === null || accuracyM === undefined || Number.isNaN(accuracyM)) {
    return (
      <p
        role="status"
        aria-live="polite"
        className={cn("text-sm text-muted-foreground", className)}
      >
        Précision GPS inconnue
      </p>
    );
  }
  const { level, variant, text } = describeAccuracy(accuracyM);
  return (
    <p
      role="status"
      aria-live="polite"
      data-precision={level}
      className={cn("flex flex-wrap items-center gap-2 text-sm", className)}
    >
      <Badge variant={variant}>
        <span className="tabular">± {Math.round(accuracyM)} m</span>
      </Badge>
      <span>{text}</span>
    </p>
  );
}
