import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getCommuneStats,
  getDepartementStats,
  getNationalStats,
  statsFiltersSchema,
} from "@/modules/analytics";

export const dynamic = "force-dynamic";

const querySchema = statsFiltersSchema.extend({
  level: z.enum(["national", "departements", "communes"]).default("communes"),
});

// Agrégats territoriaux publics : des comptes par commune ou département, jamais de donnée
// individuelle. Chaque réponse porte sa provenance (source, date, part vérifiée).
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }
  const { level, ...filters } = parsed.data;
  const payload =
    level === "national"
      ? await getNationalStats(filters)
      : level === "departements"
        ? await getDepartementStats(filters)
        : await getCommuneStats(filters);

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
