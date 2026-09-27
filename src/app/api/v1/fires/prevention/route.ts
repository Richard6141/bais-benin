import { NextResponse, type NextRequest } from "next/server";
import { queueFirePrevention } from "@/modules/fires";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";

// Tâche planifiée du lundi à 8 h (ADR-0038 §3) : conseil de la saison des feux aux producteurs
// des communes les plus touchées, de novembre à avril. Ne fait rien hors saison, ni tant que
// FIRE_PREVENTION_MESSAGES vaut 0. L'envoi suit par la tâche d'envoi des messages.
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json(await queueFirePrevention());
}

// Vercel Cron appelle en GET avec le même en-tête Authorization : même traitement.
export const GET = POST;
