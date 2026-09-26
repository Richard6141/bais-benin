import type { Polygon } from "./geometry";
import type { Db } from "./types";

// Un contour attribué depuis un champ détecté (ADR-0029) doit venir de champs qui existent et le
// recouvrir : l'agent peut le corriger, pas le remplacer par un tracé sans lien avec eux.
export async function matchesReferenceFields(
  db: Db,
  ids: readonly string[],
  polygon: Polygon,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const geojson = JSON.stringify(polygon);
  const rows = await db.$queryRaw<{ found: bigint; hit: boolean | null }[]>`
    SELECT COUNT(*) AS found, bool_or(ST_Intersects(f."geom", g.geog)) AS hit
    FROM "reference_field" f,
      (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geography AS geog) g
    WHERE f."id" = ANY(${ids as string[]}::bigint[])`;
  const row = rows[0];
  if (Number(row?.found ?? 0) !== new Set(ids).size) {
    return { ok: false, message: "Champ détecté inconnu" };
  }
  if (!row?.hit) {
    return { ok: false, message: "Le contour ne recouvre aucun des champs détectés indiqués" };
  }
  return { ok: true };
}
