import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { AnalyticsError, exportAnalyticsCsv, type ExportKind } from "@/modules/analytics";

export const dynamic = "force-dynamic";

const STATUS: Record<AnalyticsError["code"], number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

// Export CSV des agrégats (pilotage-parcours-ux §2.E) : ?kind=indicators|production et les
// filtres du tableau de bord (campaignCode, cropCode, departementCode, communeCode,
// verificationStatus). Périmètre de l'acteur, masquage k = 5, journalisé (analytics.export).
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { kind = "indicators", ...filters } = Object.fromEntries(request.nextUrl.searchParams);
  try {
    const file = await exportAnalyticsCsv(api.actor, kind as ExportKind, filters);
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
