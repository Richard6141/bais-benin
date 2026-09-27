import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { FeedbackError, exportFeedbackCsv, parseFeedbackFilters } from "@/modules/feedback";

export const dynamic = "force-dynamic";

// Export CSV des avis des testeurs (chantier J), avec les filtres de la page (?type, ?role,
// ?statut). Ministère seulement ; l'auteur n'y figure jamais, seulement son rôle.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const file = await exportFeedbackCsv(
      api.actor,
      parseFeedbackFilters(Object.fromEntries(request.nextUrl.searchParams)),
    );
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof FeedbackError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
    }
    throw error;
  }
}
