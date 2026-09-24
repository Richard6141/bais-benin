import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { getFarmDetail } from "@/modules/registry";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// Fiche d'une exploitation. Une exploitation hors périmètre répond 404, pas 403 :
// son existence même n'est pas révélée.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const farm = await getFarmDetail(api.actor, id);
  if (!farm) return NextResponse.json({ error: "Exploitation introuvable" }, { status: 404 });
  return NextResponse.json(farm, { headers: { "Cache-Control": "private, no-store" } });
}
