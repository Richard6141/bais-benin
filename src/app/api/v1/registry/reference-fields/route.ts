import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import {
  MAX_MERGED_FIELDS,
  readReferenceFields,
  splitReferenceField,
} from "@/modules/reference-fields/read";

export const dynamic = "force-dynamic";

const cutSchema = z
  .string()
  .transform((value) => value.split(",").map(Number))
  .pipe(
    z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  );

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
  const cutParam = request.nextUrl.searchParams.get("cut");
  if (cutParam !== null) {
    const cut = cutSchema.safeParse(cutParam);
    const [only] = ids.data;
    if (!cut.success || ids.data.length !== 1 || !only) {
      return NextResponse.json({ error: "Coupe invalide" }, { status: 400 });
    }
    const [x1, y1, x2, y2] = cut.data;
    const split = await splitReferenceField(api.actor, only, [
      [x1, y1],
      [x2, y2],
    ]);
    if (split.status === "not_found") {
      return NextResponse.json({ error: "Champ introuvable" }, { status: 404 });
    }
    if (split.status === "invalid_cut") {
      return NextResponse.json(
        { error: "Cette ligne ne coupe pas le champ en deux parts utiles" },
        { status: 422 },
      );
    }
    return NextResponse.json(split, { headers: { "Cache-Control": "private, no-store" } });
  }
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
