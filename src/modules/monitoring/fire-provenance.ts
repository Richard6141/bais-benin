import { FIRE_ALERT_WINDOW_MS } from "@/database/sql/fires.sql";
import { usesFires, usesReports, usesWeather, type IndicatorValue, type RuleNode } from "./rules";

// Provenance d'une alerte « feu de brousse » (ADR-0022), sans accès à la base : lue par
// l'évaluation au moment de lever l'alerte.

/** Fenêtre des détections qui comptent pour une alerte. */
export const FIRE_WINDOW_MS = FIRE_ALERT_WINDOW_MS;

/** Provenance d'une alerte levée par une règle qui ne lit que les feux ; null sinon. */
export function fireAlertProvenance(
  definition: RuleNode,
  farms: IndicatorValue,
  now: Date,
): {
  sourceId: string;
  reliability: "ESTIMATED";
  sourceDate: Date;
  messageValues: Record<string, number>;
} | null {
  if (!usesFires(definition) || usesWeather(definition) || usesReports(definition)) return null;
  return {
    sourceId: "NASA_FIRMS",
    reliability: "ESTIMATED",
    sourceDate: now,
    messageValues: { fire_farms: typeof farms === "number" ? farms : 0 },
  };
}
