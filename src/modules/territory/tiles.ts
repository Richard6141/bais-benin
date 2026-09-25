import {
  communeTile,
  departementTile,
  farmPointsTile,
  type FarmTileScope,
} from "@/database/sql/tiles.sql";

export type TileLayerName = "communes" | "departements" | "farms";
export type { FarmTileScope };

export interface RenderTileOptions {
  // Communes autorisées pour les points d'exploitations ; ignoré pour les autres couches.
  farmScope?: FarmTileScope;
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
  return layer === "communes" ? communeTile(z, x, y) : departementTile(z, x, y);
}
