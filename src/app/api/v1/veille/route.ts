import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { WatchAccessError, getWatchSummary } from "@/modules/watch";

export const dynamic = "force-dynamic";

// Synthèse du centre de veille (ADR-0022), relue chaque minute par la page sans la recharger.
// Ministère seulement ; jamais en cache.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const summary = await getWatchSummary(api.actor);
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof WatchAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
