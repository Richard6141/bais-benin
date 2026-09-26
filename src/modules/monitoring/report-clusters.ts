import { readReportClusters } from "@/database/sql/report-clusters.sql";
import {
  clusterKey,
  clusterParamsOf,
  usesWeather,
  type ConditionResolver,
  type RuleNode,
} from "./rules";

// Regroupements de signalements dans l'évaluation des règles (ADR-0015) : valeurs calculées une
// fois par jeu de paramètres pour toutes les communes évaluées, puis lues condition par
// condition. Une commune sans signalement vaut 0 : la condition est évaluable, et fausse.

export type ClusterValues = Map<string, Map<string, number>>;

export async function computeClusterValues(
  definitions: readonly RuleNode[],
  communeIds: readonly string[],
  referenceDate: string,
): Promise<ClusterValues> {
  const until = new Date(`${referenceDate}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  const values: ClusterValues = new Map();
  for (const params of clusterParamsOf(definitions)) {
    values.set(clusterKey(params), await readReportClusters({ ...params, until, communeIds }));
  }
  return values;
}

export function clusterResolver(values: ClusterValues, communeId: string): ConditionResolver {
  return (condition) =>
    condition.params ? (values.get(clusterKey(condition.params))?.get(communeId) ?? 0) : undefined;
}

/**
 * Provenance et valeurs de message d'une alerte levée par une règle qui ne lit que des
 * signalements : source « signalements », fiabilité déclarative (vérifiée par un agent si la
 * règle ne compte que des signalements confirmés), marqueurs {report_cluster}, {radius_km},
 * {days} pour les gabarits. Null pour une règle qui lit la météo : sa provenance reste la météo.
 * Un foyer compté sur des signalements non vérifiés attend la confirmation d'un agent avant
 * d'être diffusé aux producteurs (ADR-0015, revue de sécurité R1).
 */
export function reportAlertProvenance(
  definition: RuleNode,
  values: ClusterValues,
  communeId: string,
  now: Date,
): {
  sourceId: string;
  reliability: "DECLARED" | "AGENT_VERIFIED";
  sourceDate: Date;
  messageValues: Record<string, number>;
  awaitingConfirmation: boolean;
} | null {
  if (usesWeather(definition)) return null;
  const params = clusterParamsOf([definition]);
  const first = params[0];
  if (!first) return null;
  const verified = params.every((p) => p.confirmedOnly);
  return {
    sourceId: "BAIS_SIGNALEMENTS",
    reliability: verified ? "AGENT_VERIFIED" : "DECLARED",
    awaitingConfirmation: !verified,
    sourceDate: now,
    messageValues: {
      report_cluster: values.get(clusterKey(first))?.get(communeId) ?? 0,
      radius_km: first.radiusKm,
      days: first.days,
    },
  };
}
