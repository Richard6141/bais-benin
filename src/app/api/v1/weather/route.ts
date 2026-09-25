import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCommuneWeather } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  commune: z
    .string()
    .trim()
    .regex(/^BJ-[A-Z]{3}-\d{3}$/),
});

// Météo d'une commune (observations récentes et prévisions) : données agrégées publiques,
// servies avec leur source et leur date de récupération.
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Code de commune attendu (BJ-XXX-000)" }, { status: 400 });
  }
  const weather = await getCommuneWeather(parsed.data.commune);
  if (!weather) return NextResponse.json({ error: "Commune inconnue" }, { status: 404 });
  return NextResponse.json(weather, {
    headers: { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
