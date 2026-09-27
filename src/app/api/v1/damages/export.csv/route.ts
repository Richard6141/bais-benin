import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { DamageError, exportDamageCsv } from "@/modules/fires";

export const dynamic = "force-dynamic";

const STATUSES = ["PROPOSED", "CONFIRMED", "REJECTED"] as const;

// Export CSV des déclarations de sinistre après un feu (ADR-0038 §2), filtré par état (?etat).
// Ministère seulement ; chaque export est inscrit au journal d'audit.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const etat = request.nextUrl.searchParams.get("etat");
  const status = STATUSES.find((value) => value === etat);
  try {
    const file = await exportDamageCsv(api.actor, status ? { status } : {});
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DamageError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
    }
    throw error;
  }
}
