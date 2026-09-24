import { communeTile, departementTile, farmPointsTile } from "@/database/sql/tiles.sql";

export type TileLayerName = "communes" | "departements" | "farms";

const producers: Record<
  TileLayerName,
  (z: number, x: number, y: number) => Promise<Buffer | null>
> = {
  communes: communeTile,
  departements: departementTile,
  farms: farmPointsTile,
};

// Point d'entrée unique des tuiles vectorielles pour les routes : la couche est nommée,
// le SQL reste dans src/database/sql.
export function renderTile(layer: TileLayerName, z: number, x: number, y: number) {
  return producers[layer](z, x, y);
}
