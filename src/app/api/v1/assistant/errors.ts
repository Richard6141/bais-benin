import { NextResponse } from "next/server";
import { AssistantError } from "@/modules/assistant";

const STATUS: Record<AssistantError["code"], number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  RATE_LIMITED: 429,
};

// Traduction commune des erreurs de l'assistant en réponses HTTP.
export function assistantErrorResponse(error: unknown): NextResponse {
  if (error instanceof AssistantError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: STATUS[error.code] },
    );
  }
  throw error;
}

export const unauthenticated = () =>
  NextResponse.json({ error: "Authentification requise" }, { status: 401 });

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
