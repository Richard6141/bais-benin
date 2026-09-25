import { NextResponse } from "next/server";
import { RuleAdminError } from "@/modules/monitoring/rule-admin";

const STATUS: Record<RuleAdminError["code"], number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 422,
  REASON_REQUIRED: 400,
  CONFIRMATION_REQUIRED: 409,
};

// Traduction commune des erreurs de gouvernance des règles en réponses HTTP.
export function ruleErrorResponse(error: unknown): NextResponse {
  if (error instanceof RuleAdminError) {
    return NextResponse.json(
      { error: error.code, message: error.message, issues: error.issues },
      { status: STATUS[error.code] },
    );
  }
  throw error;
}

export const unauthenticated = () =>
  NextResponse.json({ error: "Authentification requise" }, { status: 401 });
