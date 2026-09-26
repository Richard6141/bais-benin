import { NextResponse, type NextRequest } from "next/server";
import { firesToGeoJson, listFires, type FireWindow } from "@/modules/fires";

export const dynamic = "force-dynamic";

// Feux actifs pour la carte (ADR-0022) : GeoJSON des détections des dernières 24 heures ou des
// 7 derniers jours. Donnée publique de la NASA, sans lien avec une personne : servie sans
// connexion, en cache court (l'ingestion passe toutes les 30 minutes).
export async function GET(request: NextRequest) {
  const window: FireWindow = request.nextUrl.searchParams.get("fenetre") === "7j" ? "7d" : "24h";
  const fires = await listFires(window);
  return NextResponse.json(firesToGeoJson(fires), {
    headers: { "Cache-Control": "public, max-age=120, s-maxage=300" },
  });
}
