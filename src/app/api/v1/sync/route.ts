import { after, NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { readJsonWithLimit } from "@/lib/http/read-json";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { evaluateNewReports } from "@/modules/monitoring";
import { applySyncBatch, syncBatchSchema } from "@/modules/sync";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
// D : par compte, en plus des 50 commandes au plus par lot. Une file hors ligne pleine se vide
// en quelques lots ; au-delà, l'appareil garde ses saisies et réessaie plus tard (sync-client).
const SYNC_RULE = { windowSeconds: 5 * 60, max: 60 };

// Réception des lots de l'outbox hors ligne (docs/modules/registre-parcours-ux.md §5).
// Une session valide est requise ; l'appareil émetteur est identifié par l'en-tête X-Device-Id,
// conservé avec chaque commande pour l'audit et la révocation d'appareil.
export async function POST(request: NextRequest) {
  // B1 : getApiActor applique en plus les contrôles de session (suspension, limite de 12 h
  // institutionnelle, compte sans NPI lié) qu'une lecture brute de la session ne fait pas.
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
  if (!(await consumeRateLimit(`sync-user:${apiActor.userId}`, SYNC_RULE))) {
    return NextResponse.json(
      { error: "Trop de lots envoyés : les saisies restent sur l'appareil et repartiront" },
      { status: 429, headers: { "Retry-After": String(SYNC_RULE.windowSeconds) } },
    );
  }

  // D : plafond appliqué au flux lui-même, même sans Content-Length (envoi par morceaux).
  const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "TOO_LARGE"
      ? NextResponse.json({ error: "Lot trop volumineux" }, { status: 413 })
      : NextResponse.json({ error: "Corps JSON illisible" }, { status: 400 });
  }
  const parsed = syncBatchSchema.safeParse(body.value);
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

  // ADR-0015 : des signalements nouveaux peuvent former un foyer. Les règles de regroupement sont
  // réévaluées après la réponse, sans la retarder ; un échec reste dans les journaux.
  const reportIds = results
    .filter((r) => r.outcome === "APPLIED" && r.entity?.type === "fieldReport")
    .map((r) => r.entity!.id);
  if (reportIds.length > 0) {
    after(() =>
      evaluateNewReports(reportIds).catch((error: unknown) =>
        logger.error({ err: error, reportIds }, "Évaluation des regroupements impossible"),
      ),
    );
  }
  return NextResponse.json({ results, receivedAt: new Date().toISOString() });
}
