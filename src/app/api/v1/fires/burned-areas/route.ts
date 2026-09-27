import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { burnProvider, measureBurnAssessments } from "@/modules/fires";
import { MonitoringBusyError } from "@/modules/monitoring/lock";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Surface brûlée des parcelles exposées (ADR-0038 §2), chaque jour à 9 h : mesure des parcelles en
// file dont la fenêtre d'après le feu est close, une requête Statistical par parcelle (environ
// 0,1 unité), jusqu'au plafond mensuel FIRE_BURN_MONTHLY_UNIT_CAP. FIRE_BURN_READS=1 : Copernicus,
// parcelles réelles seulement ; sinon la fixture. Première mesure réelle : ?limit=5, pour
// confirmer le coût par parcelle avant de laisser la tâche aller au plafond.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "limit attendu entre 1 et 500" }, { status: 400 });
  }
  const provider = burnProvider();
  if (!provider.canProcess) {
    return NextResponse.json({ error: "Imagerie satellite non configurée" }, { status: 503 });
  }
  let result;
  try {
    result = await measureBurnAssessments({ provider, limit: parsed.data.limit });
  } catch (error) {
    // Un passage est déjà en cours (verrou) : on ne dépense rien de plus.
    if (error instanceof MonitoringBusyError) {
      return NextResponse.json({ error: "Mesure déjà en cours" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({
    reads: getServerEnv().FIRE_BURN_READS === "1" ? "copernicus" : "fixture",
    ...result,
  });
}

// Vercel Cron appelle en GET avec le même en-tête Authorization : même traitement.
export const GET = POST;
