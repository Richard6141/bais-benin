import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyWapyEvent, wapyEventSchema } from "@/modules/monitoring/delivery";
import { verifyWapySignature } from "@/services/messaging/wapy/webhook-signature";

export const dynamic = "force-dynamic";

// Webhook wapy.pro : accusés de remise et réponses des destinataires (docs/09 §1). Pas de
// session : l'authenticité vient de la signature HMAC du corps brut. Un événement valide mais
// inconnu répond 200 pour que le fournisseur ne le renvoie pas indéfiniment.
export async function POST(request: NextRequest) {
  const secret = getServerEnv().WAPY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook wapy.pro non configuré" }, { status: 503 });
  }
  const rawBody = await request.text();
  if (!verifyWapySignature(rawBody, request.headers.get("x-wapy-signature"), secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corps JSON illisible" }, { status: 400 });
  }
  const parsed = wapyEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Événement non reconnu" }, { status: 400 });
  }

  const result = await applyWapyEvent(parsed.data);
  if (!result.handled) logger.info({ reason: result.reason }, "Événement wapy.pro sans effet");
  return NextResponse.json({ ok: true, ...result });
}
