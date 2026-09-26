import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { collectParcelSeries } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cultures par parcelle (ADR-0030) : lit ou complète les séries Sentinel-2 et Sentinel-1 des
// parcelles des communes pilotes, les parcelles vérifiées d'abord. Deux requêtes Statistical par
// parcelle, dans la part des statistiques : environ 0,7 unité à la première lecture, 0,1 ensuite
// pour chaque mois ajouté. Planifiée du 10 au 14 du mois ; une parcelle à jour ne coûte rien.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});

export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "limit attendu entre 1 et 1000" }, { status: 400 });
  }
  const provider = getRemoteSensingProvider();
  if (!provider.canProcess) {
    return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
  }
  const result = await collectParcelSeries({ provider, limit: parsed.data.limit });
  return NextResponse.json(result);
}

// Vercel Cron appelle en GET.
export const GET = POST;
