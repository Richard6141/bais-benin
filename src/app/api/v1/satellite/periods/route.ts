import { NextResponse } from "next/server";
import { getImageryCatalog } from "@/modules/satellite";

export const dynamic = "force-dynamic";

// Périodes d'imagerie Sentinel-2 du Bénin (douze derniers mois) : nombre de scènes, nébulosité,
// période proposée par défaut. Métadonnées publiques du catalogue Copernicus, sans compte.
export async function GET() {
  const catalog = await getImageryCatalog();
  return NextResponse.json(catalog, {
    headers: {
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
