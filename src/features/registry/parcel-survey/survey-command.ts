import type { GeoPosition } from "@/components/forms/location-picker";
import { closeRing, estimatePolygonAreaHa } from "@/lib/geo/polygon-area";
import type { AgentDatabase } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";

export const MIN_SURVEY_CORNERS = 3;

export interface SurveyInput {
  farmId: string;
  parcelId: string;
  expectedVersion: number;
  corners: GeoPosition[];
}

export type BuiltSurvey =
  | {
      ok: true;
      payload: SyncPayload["parcel.geometry.set"];
      areaHa: number;
      enqueue: (db: AgentDatabase) => Promise<void>;
    }
  | { ok: false; error: string };

// Traduit les coins relevés à pied en commande `parcel.geometry.set`. La surface renvoyée ici
// (`areaHa`) n'est qu'une estimation locale pour comparer tout de suite à la superficie déclarée ;
// la mesure qui fait foi est recalculée par le serveur (PostGIS) à la synchronisation.
export function buildParcelSurveyCommand(input: SurveyInput): BuiltSurvey {
  if (input.corners.length < MIN_SURVEY_CORNERS) {
    return {
      ok: false,
      error: `Relevez au moins ${MIN_SURVEY_CORNERS} coins pour fermer un contour.`,
    };
  }
  const ring = closeRing(input.corners);
  const accuracies = input.corners
    .map((c) => c.accuracyM)
    .filter((a): a is number => a !== undefined);
  const gpsAccuracyM =
    accuracies.length > 0
      ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
      : undefined;

  const payload: SyncPayload["parcel.geometry.set"] = {
    parcelId: input.parcelId,
    geometry: {
      type: "Polygon",
      coordinates: [ring.map((point) => [point.lng, point.lat] as [number, number])],
    },
    captureMethod: "GPS_WALK",
    gpsAccuracyM,
    expectedVersion: input.expectedVersion,
  };

  return {
    ok: true,
    payload,
    areaHa: estimatePolygonAreaHa(input.corners),
    enqueue: async (db) => {
      const id = crypto.randomUUID();
      await enqueueCommand(db, {
        id,
        type: "parcel.geometry.set",
        payload,
        expectedVersion: input.expectedVersion,
      });
      await db.farms
        .where("id")
        .equals(input.farmId)
        .modify({ syncState: "MODIFIED", updatedAt: new Date().toISOString() });
    },
  };
}

export interface SatelliteContourInput {
  farmId: string;
  parcelId: string;
  expectedVersion: number;
  /** Anneau fermé [longitude, latitude] du contour proposé puis corrigé par l'agent. */
  ring: [number, number][];
}

/**
 * Contour proposé depuis l'image Sentinel-2 puis validé par l'agent (ADR-0016, phase 3) : même
 * commande que le relevé à pied, avec le mode SATELLITE_ASSISTED. Le serveur lui donne la
 * fiabilité AGENT_VERIFIED, jamais FIELD_VERIFIED, réservée à la marche sur place.
 */
export function buildSatelliteContourCommand(input: SatelliteContourInput): BuiltSurvey {
  const open = input.ring.slice(0, -1);
  if (open.length < MIN_SURVEY_CORNERS) {
    return { ok: false, error: "Le contour doit garder au moins trois sommets." };
  }
  const corners = open.map(([lng, lat]) => ({ lng, lat }));
  const ring = closeRing(corners);
  const payload: SyncPayload["parcel.geometry.set"] = {
    parcelId: input.parcelId,
    geometry: {
      type: "Polygon",
      coordinates: [ring.map((point) => [point.lng, point.lat] as [number, number])],
    },
    captureMethod: "SATELLITE_ASSISTED",
    expectedVersion: input.expectedVersion,
  };
  return {
    ok: true,
    payload,
    areaHa: estimatePolygonAreaHa(corners),
    enqueue: async (db) => {
      await enqueueCommand(db, {
        id: crypto.randomUUID(),
        type: "parcel.geometry.set",
        payload,
        expectedVersion: input.expectedVersion,
      });
      await db.farms
        .where("id")
        .equals(input.farmId)
        .modify({ syncState: "MODIFIED", updatedAt: new Date().toISOString() });
    },
  };
}
