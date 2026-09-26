import {
  readFarmParcelOverlaps,
  readParcelOverlaps,
  type ParcelOverlapRow,
} from "@/database/sql/parcel-overlaps.sql";
import { scopeFilter, type Actor } from "@/modules/authorization";

// Chevauchements de parcelles : deux contours qui se recouvrent signalent un doublon, une erreur
// de relevé ou un conflit foncier. Le ministère voit la liste nationale. L'agent voit, sur la fiche
// d'une exploitation qu'il a enregistrée, qu'une parcelle en recouvre une autre ; il ne voit
// l'identité de l'autre parcelle que s'il l'a aussi enregistrée (ADR-0014).

export type OverlapKind = "SAME_FARM" | "OTHER_FARM";

export interface ParcelOverlapPair {
  kind: OverlapKind;
  parcelCode: string;
  farmCode: string;
  otherParcelCode: string;
  otherFarmCode: string;
  communeCode: string;
  communeName: string;
  departementName: string;
  overlapHa: number;
  /** Part de la plus petite des deux parcelles couverte par le recouvrement (0 à 1). */
  overlapShare: number;
}

export interface ParcelOverlapList {
  total: number;
  pairs: ParcelOverlapPair[];
}

export const OVERLAP_LIST_LIMIT = 50;

function kindOf(row: ParcelOverlapRow): OverlapKind {
  return row.farm_id === row.other_farm_id ? "SAME_FARM" : "OTHER_FARM";
}

/** Liste nationale, ministère seulement (lecture de tout le registre). */
export async function listParcelOverlaps(
  actor: Actor,
  filters: { departementCode?: string } = {},
): Promise<ParcelOverlapList | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const { rows, total } = await readParcelOverlaps({
    departementCode: filters.departementCode,
    limit: OVERLAP_LIST_LIMIT,
  });
  return {
    total,
    pairs: rows.map((row) => ({
      kind: kindOf(row),
      parcelCode: row.parcel_code,
      farmCode: row.farm_code,
      otherParcelCode: row.other_parcel_code,
      otherFarmCode: row.other_farm_code,
      communeCode: row.commune_code,
      communeName: row.commune_name,
      departementName: row.departement_name,
      overlapHa: row.overlap_m2 / 10_000,
      overlapShare: row.overlap_share,
    })),
  };
}

export interface ParcelOverlapFlag {
  kind: OverlapKind;
  overlapHa: number;
  overlapShare: number;
  /** Code de l'autre parcelle, seulement si l'acteur peut lire son exploitation. */
  otherParcelCode: string | null;
}

/**
 * Recouvrements des parcelles d'une exploitation déjà autorisée en lecture, par parcelle. L'autre
 * parcelle n'est nommée que si elle est de la même exploitation, si l'acteur lit tout le registre,
 * ou si l'agent a aussi enregistré l'autre exploitation.
 */
export async function farmParcelOverlaps(
  actor: Actor,
  farmId: string,
): Promise<Map<string, ParcelOverlapFlag[]>> {
  const rows = await readFarmParcelOverlaps(farmId);
  const readsAll = scopeFilter(actor, "farm.read").kind === "all";
  const byParcel = new Map<string, ParcelOverlapFlag[]>();
  for (const row of rows) {
    const kind = kindOf(row);
    const named = kind === "SAME_FARM" || readsAll || row.other_registered_by_id === actor.userId;
    const flags = byParcel.get(row.parcel_id) ?? [];
    flags.push({
      kind,
      overlapHa: row.overlap_m2 / 10_000,
      overlapShare: row.overlap_share,
      otherParcelCode: named ? row.other_parcel_code : null,
    });
    byParcel.set(row.parcel_id, flags);
  }
  return byParcel;
}
