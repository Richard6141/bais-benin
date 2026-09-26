import { readAssistanceStats } from "@/database/sql/assistance.sql";
import { analyticsScope, maskSmallCells } from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";

// Volumes et délais des demandes d'assistance par commune, pour le ministère (et l'agent sur son
// périmètre) : droit analytics.read, jamais la lecture des demandes elles-mêmes. Une commune qui
// compte moins de 5 demandes est masquée, comme toute case du tableau de bord (k = 5), avec le
// masquage complémentaire quand le total national est affiché.

export interface AssistanceCommuneStats {
  communeCode: string;
  communeName: string;
  total: number | null;
  received: number | null;
  inProgress: number | null;
  resolved: number | null;
  medianHoursToTake: number | null;
  medianHoursToResolve: number | null;
  masked: boolean;
}

export interface AssistanceStats {
  days: number;
  communes: AssistanceCommuneStats[];
  total: { requests: number; resolved: number };
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

export async function assistanceStats(actor: Actor, days = 90): Promise<AssistanceStats> {
  const scope = await analyticsScope(actor);
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await readAssistanceStats(since, scope.national ? null : scope.communeIds);
  const communes = maskSmallCells(
    rows.map((r) => ({
      communeCode: r.commune_code,
      communeName: r.commune_name,
      total: r.total,
      received: r.received,
      inProgress: r.in_progress,
      resolved: r.resolved,
      medianHoursToTake: round(r.median_hours_to_take),
      medianHoursToResolve: round(r.median_hours_to_resolve),
    })),
    {
      count: (r) => r.total,
      groupTotal: true,
      fields: [
        "total",
        "received",
        "inProgress",
        "resolved",
        "medianHoursToTake",
        "medianHoursToResolve",
      ],
    },
  );
  const requests = rows.reduce((sum, r) => sum + r.total, 0);
  const resolved = rows.reduce((sum, r) => sum + r.resolved, 0);
  return { days, communes, total: { requests, resolved } };
}
