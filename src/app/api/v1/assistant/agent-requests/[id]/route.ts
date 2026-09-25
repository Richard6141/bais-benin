import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { markRequestHandled } from "@/modules/assistant";
import { assistantErrorResponse, unauthenticated } from "../../errors";

export const dynamic = "force-dynamic";

// Demande traitée par l'agent (appel ou visite faits par ses moyens habituels).
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "INVALID", message: "Identifiant invalide" },
      { status: 400 },
    );
  }
  try {
    await markRequestHandled(api.actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
