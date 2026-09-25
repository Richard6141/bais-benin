import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { simulateRule } from "@/modules/monitoring/rule-admin";
import { ruleErrorResponse, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";
// Une simulation de 30 jours sur 77 communes prend quelques secondes.
export const maxDuration = 120;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  draftDefinition: z.unknown().optional(),
  from: isoDate,
  to: isoDate,
});

// « Que se serait-il passé ? » : rejoue une règle (ou un brouillon) sur une période passée.
export async function POST(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Demande illisible" }, { status: 400 });
  try {
    return NextResponse.json(await simulateRule(api.actor, body.data));
  } catch (error) {
    return ruleErrorResponse(error);
  }
}
