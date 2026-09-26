import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runVegetationChecks } from "@/modules/satellite";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tâche planifiée quotidienne (ADR-0016) : confrontation déclaration / satellite d'un lot de
// parcelles relevées. 150 par jour par défaut, soit environ 4 500 requêtes Statistical par mois :
// la moitié du plafond, l'autre moitié restant aux images de la carte.
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
  const result = await runVegetationChecks({ provider, limit: parsed.data.limit });
  return NextResponse.json(result);
}

// Vercel Cron appelle en GET.
export const GET = POST;
