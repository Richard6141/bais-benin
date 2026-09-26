import { NextResponse, type NextRequest } from "next/server";
import { renderCropMap } from "@/modules/satellite";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Carte des cultures (ADR-0021) : calcule les quarts du pays manquants ou périmés, avec un long
// délai, hors de toute requête de visiteur. Planifiée du 1er au 8 du mois ; un quart déjà à jour
// ne coûte rien, et un appel interrompu par le délai reprend au suivant. ?force=1 refait tout.
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await renderCropMap({ force: request.nextUrl.searchParams.get("force") === "1" });
  if (!result) {
    return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
  }
  return NextResponse.json(result);
}

// Vercel Cron appelle en GET.
export const GET = POST;
