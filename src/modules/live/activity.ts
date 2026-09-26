import {
  readLiveActivity,
  type LiveActivityRow,
  type LiveActivityScope,
} from "@/database/sql/live-activity.sql";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { scopedCommuneIds } from "@/modules/registry";

// Fil d'activité en direct (plan d'action, chantier H) : ce qui arrive du terrain, au fil de l'eau.
// Ministère : tout le pays. Agent : les exploitations qu'il a enregistrées (ADR-0014) et les faits
// communaux de son territoire. Les autres comptes n'ont pas de fil : leurs alertes et leurs
// demandes ont déjà leurs écrans. Aucun nom de personne n'est transmis.

export const LIVE_ACTIVITY_LIMIT = 50;

export type LiveAudience = "MINISTRY" | "AGENT";

export interface LiveActivityItem {
  id: string;
  kind: string;
  detail: string | null;
  /** Arrivée sur le serveur, ISO 8601. */
  at: string;
  communeCode: string;
  communeName: string;
  departementName: string;
  point: { lng: number; lat: number } | null;
  /** Fiche à ouvrir dans l'espace du lecteur, s'il y en a une. */
  href: string | null;
}

export interface LiveContext {
  audience: LiveAudience;
  scope: LiveActivityScope;
}

/** Portée du fil pour ce compte, ou null s'il n'en a pas. */
export async function liveContext(actor: Actor): Promise<LiveContext | null> {
  const roles = new Set(actor.grants.map((grant) => grant.role));
  const farms = scopeFilter(actor, "farm.read");
  if (roles.has("ADMIN_STATE") && farms.kind === "all") {
    return { audience: "MINISTRY", scope: { registeredBy: null, communeIds: null } };
  }
  if (roles.has("AGENT_AGRICULTURE") && farms.kind === "registered") {
    const communes = await scopedCommuneIds(actor);
    return {
      audience: "AGENT",
      scope: {
        registeredBy: actor.userId,
        communeIds: communes === "all" ? null : communes,
      },
    };
  }
  return null;
}

function hrefFor(row: LiveActivityRow, audience: LiveAudience): string | null {
  const space = audience === "MINISTRY" ? "/pilotage" : "/agent";
  if (row.kind.startsWith("farm.")) {
    if (audience === "AGENT" && row.farm_id) return `/agent/exploitations/${row.farm_id}`;
    return row.subject_id ? `/carte?parcelle=${row.subject_id}` : null;
  }
  switch (row.kind) {
    case "report.created":
      return row.subject_id ? `${space}/signalements/${row.subject_id}` : null;
    case "alert.raised":
      return row.subject_id ? `${space}/alertes/${row.subject_id}` : null;
    case "fire.detected":
      return "/carte?feux=24h";
    case "assistance.requested":
      return `${space}/demandes`;
    default:
      return null;
  }
}

export function toLiveItem(row: LiveActivityRow, audience: LiveAudience): LiveActivityItem {
  return {
    id: row.id,
    kind: row.kind,
    detail: row.detail,
    at: row.occurred_at.toISOString(),
    communeCode: row.commune_code,
    communeName: row.commune_name,
    departementName: row.departement_name,
    point: row.lng !== null && row.lat !== null ? { lng: row.lng, lat: row.lat } : null,
    href: hrefFor(row, audience),
  };
}

/** Faits arrivés après `since`, les plus récents d'abord. */
export async function readActivity(
  context: LiveContext,
  since: Date,
  limit = LIVE_ACTIVITY_LIMIT,
): Promise<LiveActivityItem[]> {
  const rows = await readLiveActivity(context.scope, since, limit);
  return rows.map((row) => toLiveItem(row, context.audience));
}
