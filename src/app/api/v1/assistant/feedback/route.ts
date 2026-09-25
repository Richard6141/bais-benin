import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { recordFeedback } from "@/modules/assistant";
import { assistantErrorResponse, jsonBody, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

// Retour sur une réponse : { messageId, useful, reason?, comment? }. Un retour par réponse et
// par utilisateur, remplacé s'il est renvoyé.
export async function POST(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  try {
    await recordFeedback(api.actor, await jsonBody(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
