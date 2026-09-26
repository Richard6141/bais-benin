import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isValidTile } from "@/lib/geo/tile-math";
import { getApiActor } from "@/features/auth/api-actor";
import { scopeFilter } from "@/modules/authorization";
import { scopedCommuneIds } from "@/modules/registry";
import { referenceFieldScope } from "@/modules/reference-fields/read";
import { renderTile, type FarmTileScope, type FieldTileScope } from "@/modules/territory/tiles";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  layer: z.enum(["communes", "departements", "farms", "parcels", "fields"]),
  z: z.coerce.number().int().min(0).max(18),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

// Les tuiles des limites administratives sont publiques et stables : cache long partagé.
// Les points d'exploitations changent avec les saisies : cache court.
const cacheControl: Record<"communes" | "departements" | "farms" | "parcels" | "fields", string> = {
  communes: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  departements: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  farms: "private, max-age=60",
  parcels: "private, max-age=60",
  // Champs de référence : stables (import ponctuel), mais servis selon le compte.
  fields: "private, max-age=3600",
};

interface TileParams {
  layer: string;
  z: string;
  x: string;
  y: string;
}

// Exploitations et parcelles sont des données individuelles : elles ne sont servies qu'à un
// compte connecté, avec la même portée que la lecture du registre (farm.read) : tout le pays
// pour le ministère, ses propres enregistrements pour l'agent (ADR-0014), ses exploitations pour
// le producteur. Un visiteur anonyme reçoit une tuile vide.
async function farmScopeFor(request: NextRequest): Promise<FarmTileScope> {
  const api = await getApiActor(request.headers);
  if (!api) return [];
  const filter = scopeFilter(api.actor, "farm.read");
  switch (filter.kind) {
    case "all":
      return null;
    case "none":
      return [];
    case "registered":
      return { registeredBy: filter.userId };
    case "self":
      return { ownerUserId: filter.userId };
    case "territory": {
      const ids = await scopedCommuneIds(api.actor);
      return ids === "all" ? null : ids;
    }
  }
}

// Champs de référence : contours ouverts, non nominatifs, mais réservés aux comptes qui lisent le
// registre (portée dans modules/reference-fields/read.ts).
async function fieldScopeFor(request: NextRequest): Promise<FieldTileScope> {
  const api = await getApiActor(request.headers);
  return api ? referenceFieldScope(api.actor) : [];
}

export async function GET(request: NextRequest, context: { params: Promise<TileParams> }) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse({ ...raw, y: raw.y.replace(/\.(pbf|mvt)$/, "") });
  if (!parsed.success || !isValidTile(parsed.data.z, parsed.data.x, parsed.data.y)) {
    return NextResponse.json({ error: "Tuile invalide" }, { status: 400 });
  }
  const { layer, z: zoom, x, y } = parsed.data;
  const farmScope =
    layer === "farms" || layer === "parcels" ? await farmScopeFor(request) : undefined;
  const fieldScope = layer === "fields" ? await fieldScopeFor(request) : undefined;
  const tile = await renderTile(layer, zoom, x, y, { farmScope, fieldScope });
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
