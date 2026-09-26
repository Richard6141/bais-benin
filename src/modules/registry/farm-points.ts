import { prisma } from "@/database/client";
import type { FarmListItem } from "./farms";

export interface FarmPoint {
  id: string;
  lng: number;
  lat: number;
}

/**
 * Position du siège des exploitations d'une liste déjà filtrée par le périmètre de l'acteur
 * (listFarmsForActor) : la requête ne lit que ces identifiants, jamais d'autres exploitations.
 * Sert la mini-carte de la liste de l'agent ; une exploitation sans position n'y figure pas.
 */
export async function farmPointsOf(
  items: readonly Pick<FarmListItem, "id">[],
): Promise<FarmPoint[]> {
  if (items.length === 0) return [];
  const ids = items.map((item) => item.id);
  return prisma.$queryRaw<FarmPoint[]>`
    SELECT "id", ST_X("location"::geometry) AS lng, ST_Y("location"::geometry) AS lat
    FROM "farm"
    WHERE "id" = ANY(${ids}::uuid[]) AND "location" IS NOT NULL`;
}
