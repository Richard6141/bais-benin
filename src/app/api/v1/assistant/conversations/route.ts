import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { listMyQuestions } from "@/modules/assistant";
import { unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

// Dernières questions de l'utilisateur (historique de l'écran d'accueil de l'assistant).
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  return NextResponse.json({ questions: await listMyQuestions(api.actor) });
}
