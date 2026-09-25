import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { askAssistant } from "@/modules/assistant";
import { assistantErrorResponse, jsonBody, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

// Question à l'assistant : { question, farmCode?, conversationId? }. Réponse sourcée, ou refus
// motivé (confiance insuffisante, hors sujet, dose sans source, modèle indisponible).
export async function POST(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  try {
    return NextResponse.json(await askAssistant(api.actor, await jsonBody(request)));
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
