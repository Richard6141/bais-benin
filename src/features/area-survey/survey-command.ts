import type { GeoPosition } from "@/components/forms/location-picker";
import type { AgentDatabase } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";
import type { LandCover } from "./labels";

// Constat d'un point d'enquête (ADR-0033) traduit en commande `surveyPoint.observe`. Les règles
// de l'écran sont ici pour être testées sans interface ; le serveur refait le contrôle des 50 m.

/** Même seuil que le serveur. */
export const MAX_DISTANCE_M = 50;

export interface SurveyInput {
  point: { id: string; latitude: number; longitude: number };
  landCover: LandCover | null;
  cropCode: string;
  reason: string;
  position: GeoPosition | null;
  now?: Date;
}

/** Distance en mètres entre deux positions (haversine). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const radius = 6_371_008.8;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export type BuiltSurvey =
  | {
      ok: true;
      payload: SyncPayload["surveyPoint.observe"];
      enqueue: (db: AgentDatabase) => Promise<void>;
    }
  | { ok: false; error: string };

export function buildSurveyCommand(input: SurveyInput): BuiltSurvey {
  if (!input.landCover) return { ok: false, error: "Choisissez ce que vous voyez au point." };
  const reason = input.reason.trim();
  if (input.landCover === "INACCESSIBLE") {
    if (reason.length < 3) return { ok: false, error: "Dites pourquoi le point est inaccessible." };
  } else {
    if (!input.position) {
      return { ok: false, error: "Prenez votre position : elle prouve que vous êtes au point." };
    }
    const distance = distanceM(input.position, {
      lat: input.point.latitude,
      lng: input.point.longitude,
    });
    if (distance > MAX_DISTANCE_M) {
      return {
        ok: false,
        error: `Vous êtes à ${Math.round(distance)} m du point : approchez-vous à ${MAX_DISTANCE_M} m au plus.`,
      };
    }
  }
  if (input.landCover === "CROP" && !input.cropCode) {
    return { ok: false, error: "Choisissez la culture présente au point." };
  }
  const payload: SyncPayload["surveyPoint.observe"] = {
    id: crypto.randomUUID(),
    pointId: input.point.id,
    landCover: input.landCover,
    cropCode: input.landCover === "CROP" ? input.cropCode : undefined,
    reason: input.landCover === "INACCESSIBLE" ? reason : undefined,
    observedAt: (input.now ?? new Date()).toISOString(),
    gpsPoint: input.position ? [input.position.lng, input.position.lat] : undefined,
  };
  return {
    ok: true,
    payload,
    enqueue: async (db) => {
      await enqueueCommand(db, { id: payload.id, type: "surveyPoint.observe", payload });
    },
  };
}
