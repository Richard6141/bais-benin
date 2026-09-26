import type { SyncPayload } from "@/modules/sync/commands";

// Libellés de l'occupation du sol d'un point d'enquête (ADR-0033), pour l'écran et la liste.

export type LandCover = SyncPayload["surveyPoint.observe"]["landCover"];

export const LAND_COVER_LABELS: Record<LandCover, string> = {
  CROP: "Culture",
  FALLOW: "Jachère ou sol nu",
  NATURAL: "Savane ou forêt",
  WATER: "Eau",
  BUILT: "Bâti ou route",
  INACCESSIBLE: "Inaccessible",
};
