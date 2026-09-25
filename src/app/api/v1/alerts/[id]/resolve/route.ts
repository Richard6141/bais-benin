import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { resolveAlert } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(5).max(500) });

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_ACTIVE: 409,
  REASON_REQUIRED: 400,
};

// Levée d'une alerte par le ministère, avec motif obligatoire.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Un motif de 5 caractères au moins est nécessaire" },
      { status: 400 },
    );
  }
  const result = await resolveAlert(api.actor, id, body.data.reason);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: STATUS[result.code] });
  return NextResponse.json({ ok: true });
}
