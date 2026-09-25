import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { applySyncBatch, syncBatchSchema } from "@/modules/sync";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Réception des lots de l'outbox hors ligne (docs/modules/registre-parcours-ux.md §5).
// Une session valide est requise ; l'appareil émetteur est identifié par l'en-tête X-Device-Id,
// conservé avec chaque commande pour l'audit et la révocation d'appareil.
export async function POST(request: NextRequest) {
  // B1 : getApiActor applique en plus les contrôles de session (suspension, limite de 12 h
  // institutionnelle, 2FA obligatoire pour ADMIN_STATE) qu'une lecture brute de la session
  // ne fait pas.
  const apiActor = await getApiActor(request.headers);
  if (!apiActor) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  const deviceId = request.headers.get("x-device-id")?.trim();
  if (!deviceId || deviceId.length < 4 || deviceId.length > 128) {
    return NextResponse.json(
      { error: "En-tête X-Device-Id obligatoire (4 à 128 caractères)" },
      { status: 400 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lot trop volumineux" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON illisible" }, { status: 400 });
  }
  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "Lot invalide",
        details: issue ? `${issue.path.join(".")}: ${issue.message}` : undefined,
      },
      { status: 400 },
    );
  }

  const results = await applySyncBatch(apiActor.actor, deviceId, parsed.data.commands);
  return NextResponse.json({ results, receivedAt: new Date().toISOString() });
}
