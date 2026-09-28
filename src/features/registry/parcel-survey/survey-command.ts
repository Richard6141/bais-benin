import type { GeoPosition } from "@/components/forms/location-picker";
import { closeRing, countDistinctPoints, estimatePolygonAreaHa } from "@/lib/geo/polygon-area";
import type { AgentDatabase } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";

export const MIN_SURVEY_CORNERS = 3;

/**
 * En deçà, deux coins désignent le même endroit : l'appareil n'a pas bougé entre deux appuis
 * (ordinateur sans GPS, position approchée par le réseau). Les angles d'un champ sont bien plus
 * éloignés ; le serveur refuserait le contour (PostGIS : « Too few points »).
 */
export const MIN_CORNER_SPACING_M = 1;
/** Surface sous laquelle les coins sont alignés : un trait, pas une parcelle (10 m²). */
export const MIN_CONTOUR_AREA_HA = 0.001;

export const SAME_PLACE_ERROR =
  "Les coins relevés sont au même endroit : l'appareil n'a pas bougé entre deux appuis. Marchez jusqu'à chaque angle du champ avant d'appuyer.";

/** Raison de refuser des coins avant tout envoi, ou null s'ils ferment une vraie parcelle. */
export function cornersProblem(corners: readonly { lng: number; lat: number }[]): string | null {
  if (corners.length < MIN_SURVEY_CORNERS) {
    return `Relevez au moins ${MIN_SURVEY_CORNERS} coins pour fermer un contour.`;
  }
  if (countDistinctPoints(corners, MIN_CORNER_SPACING_M) < MIN_SURVEY_CORNERS) {
    return SAME_PLACE_ERROR;
  }
  if (estimatePolygonAreaHa(corners) < MIN_CONTOUR_AREA_HA) {
    return "Les coins relevés sont alignés : le contour n'a pas de surface. Relevez les angles du champ.";
  }
  return null;
}

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
  const problem = cornersProblem(input.corners);
  if (problem) return { ok: false, error: problem };
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
  const problem = cornersProblem(corners);
  if (problem) return { ok: false, error: problem };
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

export interface FieldAttributionInput {
  farmId: string;
  parcelId: string;
  referenceFieldIds: string[];
  /** Contour du champ, ou fusion des champs choisis, tel que renvoyé par le serveur. */
  geometry: SyncPayload["parcel.create"]["geometry"];
  declaredAreaHa: number;
}

/**
 * Attribution d'un champ détecté (ADR-0029) : un seul geste, le contour vient du champ touché
 * (fusionné s'il y en a plusieurs), pas d'un relevé. Le serveur la reconnaît par sa méthode
 * (REFERENCE_FIELD) et lui donne la fiabilité AGENT_VERIFIED, jamais FIELD_VERIFIED.
 */
export type BuiltFieldAttribution =
  | {
      ok: true;
      payload: SyncPayload["parcel.create"];
      areaHa: number;
      enqueue: (db: AgentDatabase) => Promise<void>;
    }
  | { ok: false; error: string };

export function buildFieldAttributionCommand(input: FieldAttributionInput): BuiltFieldAttribution {
  const payload: SyncPayload["parcel.create"] = {
    id: input.parcelId,
    farmId: input.farmId,
    declaredAreaHa: input.declaredAreaHa,
    geometry: input.geometry,
    captureMethod: "REFERENCE_FIELD",
    referenceFieldIds: input.referenceFieldIds,
    // Sans irrigation connue à ce stade ; l'agent la précise plus tard depuis la fiche.
    irrigation: "NONE",
  };
  return {
    ok: true,
    payload,
    areaHa: input.declaredAreaHa,
    enqueue: async (db) => {
      await enqueueCommand(db, { id: input.parcelId, type: "parcel.create", payload });
      await db.farms
        .where("id")
        .equals(input.farmId)
        .modify((farm) => {
          farm.syncState = farm.syncState === "SYNCED" ? "MODIFIED" : farm.syncState;
          farm.parcelCount += 1;
          farm.updatedAt = new Date().toISOString();
        });
    },
  };
}
