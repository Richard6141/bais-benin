import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Reliability =
  "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED" | "OFFICIAL" | "ESTIMATED" | "SYNTHETIC";

export const reliabilityLabels: Record<Reliability, string> = {
  DECLARED: "Déclaré",
  AGENT_VERIFIED: "Vérifié par un agent",
  FIELD_VERIFIED: "Vérifié sur le terrain",
  OFFICIAL: "Source officielle",
  ESTIMATED: "Estimation",
  SYNTHETIC: "Donnée de démonstration",
};

// La texture porte l'information autant que la couleur : hachures pour le déclaré,
// aplat moyen pour la vérification agent, aplat plein pour le terrain (docs/07 §3).
const swatchClasses: Record<Reliability, string> = {
  DECLARED:
    "bg-[repeating-linear-gradient(135deg,var(--stone-400)_0_1.5px,transparent_1.5px_4px)] border-stone-400",
  AGENT_VERIFIED: "bg-chart-1/45 border-chart-1/60",
  FIELD_VERIFIED: "bg-chart-1 border-chart-1",
  OFFICIAL: "bg-forest border-forest",
  ESTIMATED: "bg-watch/60 border-watch",
  SYNTHETIC: "bg-stone-300 border-stone-400 border-dashed",
};

interface ReliabilityBadgeProps {
  level: Reliability;
  className?: string;
  showLabel?: boolean;
}

export function ReliabilityBadge({ level, className, showLabel = true }: ReliabilityBadgeProps) {
  const label = reliabilityLabels[level];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 pl-1.5", className)}
      title={label}
      aria-label={showLabel ? undefined : label}
      data-reliability={level}
    >
      <span aria-hidden className={cn("size-2.5 rounded-sm border", swatchClasses[level])} />
      {showLabel ? label : null}
    </Badge>
  );
}
