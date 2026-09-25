import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredConversations } from "@/modules/assistant";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";

// Tâche planifiée quotidienne de l'assistant : suppression des conversations arrivées à
// échéance (12 mois après la question, assistant-parcours-ux §2.D). Même authentification que
// les tâches du monitoring (`Authorization: Bearer <CRON_SECRET>`).
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json({ purgedConversations: await purgeExpiredConversations() });
}

// Vercel Cron appelle en GET, avec le même en-tête.
export const GET = POST;
