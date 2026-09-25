import { semanticColors } from "@/styles/tokens";
import type { Severity } from "./monitoring-logic";

// Couleurs des sévérités sur la carte, dans un fichier à part : la légende les lit sans charger
// MapLibre, qui ne part qu'avec le composant de carte (import dynamique).
export const SEVERITY_COLORS: Record<Severity, string> = {
  INFO: semanticColors.info,
  WATCH: semanticColors.watch,
  WARNING: semanticColors.warning,
  CRITICAL: semanticColors.critical,
};
