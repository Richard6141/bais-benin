import { NextResponse, type NextRequest } from "next/server";
import { trainAndPredictCrops } from "@/modules/satellite";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cultures par parcelle (ADR-0030) : entraîne une nouvelle version du modèle sur les parcelles
// des exploitations vérifiées et les cultures constatées par les agents, puis mesure la culture de
// chaque parcelle lue. Aucun appel à Copernicus. Planifiée chaque nuit : chaque visite améliore le
// modèle dès le lendemain ; sans visite ni série nouvelle, rien n'est refait.
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json(await trainAndPredictCrops());
}

// Vercel Cron appelle en GET.
export const GET = POST;
