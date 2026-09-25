import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { listAlertsForActor } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["ACTIVE", "RECENT"]).optional(),
  severity: z.enum(["INFO", "WATCH", "WARNING", "CRITICAL"]).optional(),
  category: z.enum(["WATER_STRESS", "FLOOD", "HEAT", "PEST", "MARKET", "ADMIN"]).optional(),
  commune: z.string().trim().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// Alertes visibles par le compte connecté, filtrées par périmètre en base.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  const { commune, ...filters } = parsed.data;
  const items = await listAlertsForActor(api.actor, { ...filters, communeCode: commune });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
