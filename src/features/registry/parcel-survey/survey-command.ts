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
