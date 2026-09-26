import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { MAX_MERGED_FIELDS, readReferenceFields } from "@/modules/reference-fields/read";

export const dynamic = "force-dynamic";

const idsSchema = z
  .string()
  .regex(/^\d{1,19}(,\d{1,19})*$/)
  .transform((value) => value.split(","))
  .pipe(z.array(z.string()).max(MAX_MERGED_FIELDS));

// Contour d'un ou de plusieurs champs détectés (ADR-0029), pour l'agent qui les touche sur la
// carte : le contour complet, non simplifié ni découpé par la tuile, et la fusion des champs qui se
// touchent. Hors périmètre ou inconnu : 404, comme si le champ n'existait pas.
export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const ids = idsSchema.safeParse(request.nextUrl.searchParams.get("ids") ?? "");
  if (!ids.success) return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  const result = await readReferenceFields(api.actor, ids.data);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Champ introuvable" }, { status: 404 });
  }
  if (result.status === "not_contiguous") {
    return NextResponse.json(
      { error: "Ces champs ne se touchent pas : choisissez des champs voisins" },
      { status: 422 },
    );
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
