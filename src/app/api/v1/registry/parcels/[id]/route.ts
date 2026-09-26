import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { getParcelInspection } from "@/modules/registry";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// Fiche d'une parcelle ouverte depuis la carte. Hors périmètre, la réponse est 404 comme pour une
// parcelle inconnue : son existence même n'est pas révélée.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const parcel = await getParcelInspection(api.actor, id);
  if (!parcel) return NextResponse.json({ error: "Parcelle introuvable" }, { status: 404 });
  return NextResponse.json(parcel, { headers: { "Cache-Control": "private, no-store" } });
}
