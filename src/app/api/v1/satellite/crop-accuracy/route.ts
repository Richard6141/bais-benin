import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runCropClassChecks } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Précision de la carte des cultures (ADR-0021) : classe vue par satellite sur un lot de
// parcelles d'exploitations vérifiées, pour la matrice de confusion. Une fois par mois, après la
// passe des communes : 150 parcelles, environ 0,36 unité chacune (deux à trois passages par mois,
// ADR-0028), dans la part des statistiques. Les parcelles jamais contrôlées passent d'abord, puis
// les contrôles les plus anciens.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(150),
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
  const result = await runCropClassChecks({ provider, limit: parsed.data.limit });
  return NextResponse.json(result);
}

// Vercel Cron appelle en GET.
export const GET = POST;
