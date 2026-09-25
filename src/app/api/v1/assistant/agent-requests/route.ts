import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { listAgentRequests, requestAgent } from "@/modules/assistant";
import { assistantErrorResponse, jsonBody, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ messageId: z.uuid() });

// « Demander à mon agent » (POST { messageId }) et demandes des communes de l'agent (GET).
export async function POST(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const parsed = bodySchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  try {
    return NextResponse.json(await requestAgent(api.actor, parsed.data.messageId), {
      status: 201,
    });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  try {
    return NextResponse.json({ requests: await listAgentRequests(api.actor) });
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
