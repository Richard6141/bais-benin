import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { AnalyticsError } from "@/modules/analytics";
import { exportGroupCsv } from "@/modules/producer-groups";

export const dynamic = "force-dynamic";

const STATUS: Record<AnalyticsError["code"], number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

type Params = { params: Promise<{ id: string }> };

// Export CSV des membres d'un groupe de producteurs (ADR-0024) : ministère seulement, journalisé
// (group.exported). Mêmes colonnes que le palmarès, plus l'accord WhatsApp et la parcelle.
export async function GET(request: NextRequest, context: Params) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  try {
    const file = await exportGroupCsv(api.actor, id);
    if (!file) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AnalyticsError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: STATUS[error.code] },
      );
    }
    throw error;
  }
}
