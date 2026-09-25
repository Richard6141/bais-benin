import { Info, OctagonAlert, TriangleAlert, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Niveaux d'alerte du moteur de règles (docs/modules/design-system.md §4.2). Type dupliqué ici :
// les composants ne dépendent pas des modules du domaine (frontières ESLint).
export type AlertSeverity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFO: "Information",
  WATCH: "Vigilance",
  WARNING: "Alerte",
  CRITICAL: "Alerte grave",
};

const SEVERITY_STYLE = {
  INFO: { variant: "info", Icon: Info },
  WATCH: { variant: "watch", Icon: Eye },
  WARNING: { variant: "warning", Icon: TriangleAlert },
  CRITICAL: { variant: "critical", Icon: OctagonAlert },
} as const;

interface SeverityBadgeProps {
  severity: AlertSeverity;
  size?: "default" | "large";
  className?: string;
}

// Le niveau se lit toujours dans le texte et l'icône, la couleur ne fait que l'appuyer.
export function SeverityBadge({ severity, size = "default", className }: SeverityBadgeProps) {
  const { variant, Icon } = SEVERITY_STYLE[severity];
  return (
    <Badge
      variant={variant}
      data-severity={severity}
      className={cn(size === "large" && "h-8 gap-1.5 px-3 text-sm [&>svg]:size-4", className)}
    >
      <Icon aria-hidden />
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}
