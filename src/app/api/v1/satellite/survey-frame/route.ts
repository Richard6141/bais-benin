import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { classifyFramePoints, drawAreaFrame, selectSecondPhase } from "@/modules/area-survey";
import { getRemoteSensingProvider } from "@/services/remote-sensing";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Enquête aréolaire (ADR-0033, ADR-0037) : tire la première phase des communes d'enquête qui
// n'ont pas encore de points pour la campagne ouverte (sans appel à Copernicus), lit la classe
// de la carte des pixels aux points qui ne l'ont pas (une requête Statistical par point, environ
// 0,16 unité), puis tire la seconde phase, les points à visiter, des communes dont toute la
// première phase est lue. Planifiée du 20 au 26 du mois, 100 points par jour ; un point déjà lu
// ne coûte plus rien. Une nouvelle campagne compte 480 points par commune : limit=500 pendant une
// semaine. Sur Copernicus, la lecture attend SURVEY_MAP_READS=1 : aucune passe réelle sans accord.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "limit attendu entre 1 et 500" }, { status: 400 });
  }
  const frame = await drawAreaFrame();
  const provider = getRemoteSensingProvider();
  if (!provider.canProcess) {
    return NextResponse.json(
      { frame, error: "Imagerie satellite non configurée" },
      { status: 503 },
    );
  }
  if (provider.id === "cdse" && getServerEnv().SURVEY_MAP_READS !== "1") {
    return NextResponse.json({
      frame,
      mapClasses: null,
      secondPhase: await selectSecondPhase(),
      skipped: "SURVEY_MAP_READS=0",
    });
  }
  const mapClasses = await classifyFramePoints({ provider, limit: parsed.data.limit });
  const secondPhase = await selectSecondPhase();
  return NextResponse.json({ frame, mapClasses, secondPhase });
}

// Vercel Cron appelle en GET.
export const GET = POST;
