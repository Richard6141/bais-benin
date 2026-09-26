import {
  communeTile,
  departementTile,
  farmPointsTile,
  parcelPolygonsTile,
  referenceFieldsTile,
  type FarmTileScope,
  type FieldTileScope,
} from "@/database/sql/tiles.sql";

export type TileLayerName = "communes" | "departements" | "farms" | "parcels" | "fields";
export type { FarmTileScope, FieldTileScope };

export interface RenderTileOptions {
  // Communes autorisées pour les points d'exploitations ; ignoré pour les autres couches.
  farmScope?: FarmTileScope;
  // Communes autorisées pour les champs de référence ; null : tout le pays.
  fieldScope?: FieldTileScope;
}

// Point d'entrée unique des tuiles vectorielles pour les routes : la couche est nommée,
// le SQL reste dans src/database/sql. Les limites administratives sont publiques ; les points
// d'exploitations ne sortent que dans le périmètre de l'acteur connecté.
export function renderTile(
  layer: TileLayerName,
  z: number,
  x: number,
  y: number,
  options: RenderTileOptions = {},
) {
  if (layer === "farms") return farmPointsTile(z, x, y, options.farmScope ?? null);
  if (layer === "fields") return referenceFieldsTile(z, x, y, options.fieldScope ?? []);
  if (layer === "parcels") return parcelPolygonsTile(z, x, y, options.farmScope ?? null);
  return layer === "communes" ? communeTile(z, x, y) : departementTile(z, x, y);
}
