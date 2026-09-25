import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { buildReferentiel } from "@/modules/registry";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  communes: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean)
        : undefined,
    ),
});

// Référentiel embarqué par la PWA agent (communes du périmètre avec géométrie simplifiée,
// cultures, campagnes, unités). Réservé aux comptes connectés : les géométries sont publiques,
// mais le découpage par périmètre révèle l'affectation d'un agent.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  const bundle = await buildReferentiel(api.actor, parsed.data.communes);
  return NextResponse.json(bundle, { headers: { "Cache-Control": "private, max-age=300" } });
}
