import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { listFarmsForActor } from "@/modules/registry";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  commune: z.string().trim().min(1).max(20).optional(),
  status: z.enum(["DECLARED", "AGENT_VERIFIED", "FIELD_VERIFIED", "DISPUTED"]).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
});

// Liste des exploitations visibles par l'acteur : le périmètre est appliqué en base,
// jamais côté client (docs/06 §3). Utilisée par la PWA agent pour son cache local.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const { commune, status, q, limit, cursor } = parsed.data;
  const page = await listFarmsForActor(api.actor, {
    communeCode: commune,
    verificationStatus: status,
    search: q,
    limit,
    cursor,
  });
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
