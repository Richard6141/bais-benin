import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { measureRadarCost } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Mesure du coût du radar Sentinel-1 (ADR-0019), à lancer une fois par l'exploitant avant
// d'activer SATELLITE_RADAR_FALLBACK : POST ?limit=20, avec Authorization: Bearer CRON_SECRET.
// Renvoie les unités de traitement consommées par requête. Chaque requête compte dans le quota.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "limit attendu entre 1 et 50" }, { status: 400 });
  }
  const provider = getRemoteSensingProvider();
  if (!provider.canProcess) {
    return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
  }
  return NextResponse.json(await measureRadarCost({ provider, limit: parsed.data.limit }));
}
