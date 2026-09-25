import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { readJournal } from "@/modules/assistant";
import { assistantErrorResponse, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

const OUTCOMES = new Set([
  "ANSWERED",
  "LOW_CONFIDENCE",
  "OFF_TOPIC",
  "UNSAFE_DOSAGE",
  "PROVIDER_ERROR",
]);

// Journal anonymisé des conversations : ministère (tout le pays) ou agent (ses communes).
// ?outcome=LOW_CONFIDENCE pour les questions sans réponse fiable, ?limit=50 (200 au plus).
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const params = request.nextUrl.searchParams;
  const outcome = params.get("outcome") ?? undefined;
  const limit = Number(params.get("limit") ?? 50);
  try {
    const entries = await readJournal(api.actor, {
      outcome: outcome && OUTCOMES.has(outcome) ? outcome : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
