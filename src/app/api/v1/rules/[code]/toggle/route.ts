import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiActor } from "@/features/auth/api-actor";
import { toggleRule } from "@/modules/monitoring/rule-admin";
import { ruleErrorResponse, unauthenticated } from "../../errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(500).optional(),
  confirmed: z.boolean().optional(),
});

// Activation ou désactivation d'une règle ; motif et confirmation exigés pour une règle critique.
export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const api = await getApiActor(request.headers);
  if (!api) return unauthenticated();
  const { code } = await context.params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Demande illisible" }, { status: 400 });
  try {
    return NextResponse.json(await toggleRule(api.actor, { code, ...body.data }));
  } catch (error) {
    return ruleErrorResponse(error);
  }
}
