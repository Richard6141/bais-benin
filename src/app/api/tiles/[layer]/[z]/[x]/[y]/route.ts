import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isValidTile } from "@/lib/geo/tile-math";
import { getApiActor } from "@/features/auth/api-actor";
import { scopedCommuneIds } from "@/modules/registry";
import { renderTile, type FarmTileScope } from "@/modules/territory/tiles";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  layer: z.enum(["communes", "departements", "farms"]),
  z: z.coerce.number().int().min(0).max(18),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

// Les tuiles des limites administratives sont publiques et stables : cache long partagé.
// Les points d'exploitations changent avec les saisies : cache court.
const cacheControl: Record<"communes" | "departements" | "farms", string> = {
  communes: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  departements: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  farms: "private, max-age=60",
};

interface TileParams {
  layer: string;
  z: string;
  x: string;
  y: string;
}

// Les points d'exploitations sont des données individuelles : ils ne sont servis qu'à un compte
// connecté, dans son périmètre (docs/06 §3). Un visiteur anonyme reçoit une tuile vide.
async function farmScopeFor(request: NextRequest): Promise<FarmTileScope> {
  const api = await getApiActor(request.headers);
  if (!api) return [];
  const ids = await scopedCommuneIds(api.actor);
  return ids === "all" ? null : ids;
}

export async function GET(request: NextRequest, context: { params: Promise<TileParams> }) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse({ ...raw, y: raw.y.replace(/\.(pbf|mvt)$/, "") });
  if (!parsed.success || !isValidTile(parsed.data.z, parsed.data.x, parsed.data.y)) {
    return NextResponse.json({ error: "Tuile invalide" }, { status: 400 });
  }
  const { layer, z: zoom, x, y } = parsed.data;
  const farmScope = layer === "farms" ? await farmScopeFor(request) : undefined;
  const tile = await renderTile(layer, zoom, x, y, { farmScope });
  if (!tile) {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": cacheControl[layer] },
    });
  }
  return new NextResponse(new Uint8Array(tile), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": cacheControl[layer],
    },
  });
}
