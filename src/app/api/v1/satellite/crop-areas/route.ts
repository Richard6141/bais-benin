import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runCropAreaEstimates } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Surfaces des cultures par commune (ADR-0021) : passe mensuelle, en lots. Chaque appel calcule
// au plus `limit` communes pas encore faites ce mois-ci et s'arrête net quand la part des
// statistiques ou le plafond d'unités est atteint ; l'appel suivant reprend où il s'est arrêté.
// Planifiée les huit premiers jours du mois : les 77 communes tiennent en huit lots de 12, et les
// appels suivants, une fois la passe finie, ne consomment rien.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(77).default(12),
});

export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "limit attendu entre 1 et 77" }, { status: 400 });
  }
  const provider = getRemoteSensingProvider();
  if (!provider.canProcess) {
    return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
  }
  const result = await runCropAreaEstimates({ provider, limit: parsed.data.limit });
  return NextResponse.json(result);
}

// Vercel Cron appelle en GET.
export const GET = POST;
