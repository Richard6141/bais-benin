import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { listRules } from "@/modules/monitoring/rule-admin";
import { ruleErrorResponse, unauthenticated } from "./errors";

export const dynamic = "force-dynamic";

// Liste des règles d'alerte (version active par code, déclenchements sur 30 jours).
// Ministère seulement, compte identifié par son NPI (ADR-0012).
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  try {
    return NextResponse.json({ rules: await listRules(api.actor) });
  } catch (error) {
    return ruleErrorResponse(error);
  }
}
