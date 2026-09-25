import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { getAlertDetail } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

// Fiche d'une alerte ; hors périmètre, 404 (son existence n'est pas révélée).
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const alert = await getAlertDetail(api.actor, id);
  if (!alert) return NextResponse.json({ error: "Alerte introuvable" }, { status: 404 });
  return NextResponse.json(alert, { headers: { "Cache-Control": "private, no-store" } });
}
