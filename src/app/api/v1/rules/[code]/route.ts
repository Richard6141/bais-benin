import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { createRuleVersion, getRuleHistory } from "@/modules/monitoring/rule-admin";
import { ruleErrorResponse, unauthenticated } from "../errors";

export const dynamic = "force-dynamic";

const codeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

const patchSchema = z
  .object({
    thresholds: z.record(z.string(), z.number()).optional(),
    definition: z.unknown().optional(),
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(10).max(1000).optional(),
    severity: z.enum(["INFO", "WATCH", "WARNING", "CRITICAL"]).optional(),
    cooldownHours: z.number().int().min(1).max(720).optional(),
    messageFr: z.string().trim().min(10).max(1000).optional(),
    messageShort: z.string().trim().min(10).max(300).optional(),
    adviceFr: z.string().trim().min(10).max(1000).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

type Params = { params: Promise<{ code: string }> };

// Fiche d'une règle : version courante, versions précédentes, journal.
export async function GET(request: NextRequest, context: Params) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const { code } = await context.params;
  if (!codeSchema.safeParse(code).success)
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  try {
    return NextResponse.json(await getRuleHistory(api.actor, code));
  } catch (error) {
    return ruleErrorResponse(error);
  }
}

// Nouvelle version : seuils ou textes modifiés ; l'ancienne version est désactivée.
export async function PATCH(request: NextRequest, context: Params) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const { code } = await context.params;
  if (!codeSchema.safeParse(code).success)
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Modification illisible", issues: body.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await createRuleVersion(api.actor, code, body.data);
    return NextResponse.json(
      { version: result.rule.version, changes: result.changes },
      { status: 201 },
    );
  } catch (error) {
    return ruleErrorResponse(error);
  }
}
