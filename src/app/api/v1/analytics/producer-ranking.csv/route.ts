import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { AnalyticsError, exportProducerRankingCsv } from "@/modules/analytics";

export const dynamic = "force-dynamic";

const STATUS: Record<AnalyticsError["code"], number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

// Export CSV du palmarès des producteurs (ADR-0018) : mêmes critères que la page
// /pilotage/palmares, ministère seulement, journalisé (analytics.ranking.export).
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const file = await exportProducerRankingCsv(
      api.actor,
      Object.fromEntries(request.nextUrl.searchParams),
    );
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
