import type { SyncBatchResponse, SyncResult } from "@/modules/sync/commands";
import type { AgentDatabase, OutboxEntry } from "./db";
import { applyResults, markPendingAgain, markSending, pendingCommands } from "./outbox";

export interface SyncRunOutcome {
  sent: number;
  applied: number;
  failed: number;
  error?: string;
}

interface SyncClientOptions {
  deviceId: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

// Envoie l'outbox par lots ordonnés. Une commande dont une dépendance n'est pas encore
// appliquée reste dans le lot : le serveur résout les dépendances à l'intérieur d'un lot,
// et refuse celles dont le parent a échoué.
export async function runSync(
  db: AgentDatabase,
  options: SyncClientOptions,
): Promise<SyncRunOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "/api/v1/sync";
  const batch = fitInBody(await pendingCommands(db, 50), options.deviceId);
  if (batch.length === 0) return { sent: 0, applied: 0, failed: 0 };
  const ids = batch.map((entry) => entry.id);
  await markSending(db, ids);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": options.deviceId },
      body: JSON.stringify({
        commands: batch.map((entry) => toWireCommand(entry, options.deviceId)),
      }),
      credentials: "same-origin",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "réseau indisponible";
    await markPendingAgain(db, ids, message);
    return { sent: batch.length, applied: 0, failed: 0, error: message };
  }

  if (!response.ok) {
    const message = `Le serveur a répondu ${response.status}`;
    // 401 : session expirée, l'agent doit se reconnecter ; le lot reste en attente.
    await markPendingAgain(db, ids, message);
    return { sent: batch.length, applied: 0, failed: 0, error: message };
  }

  const body = (await response.json()) as SyncBatchResponse;
  await applyResults(db, body.results);
  const applied = body.results.filter(
    (r) => r.outcome === "APPLIED" || r.outcome === "DUPLICATE",
  ).length;
  const failed = body.results.length - applied;
  return { sent: batch.length, applied, failed };
}

// Le serveur refuse un corps de plus de 2 Mo (route /api/v1/sync) : avec des photos de
// signalement, 50 commandes peuvent le dépasser. Le lot s'arrête avant, les suivantes partent au
// passage suivant ; une commande seule plus lourde part quand même, le serveur tranchera.
const MAX_BATCH_BYTES = 1_800_000;

function fitInBody(entries: OutboxEntry[], deviceId: string): OutboxEntry[] {
  const kept: OutboxEntry[] = [];
  let size = 0;
  for (const entry of entries) {
    const bytes = JSON.stringify(toWireCommand(entry, deviceId)).length;
    if (kept.length > 0 && size + bytes > MAX_BATCH_BYTES) break;
    kept.push(entry);
    size += bytes;
  }
  return kept;
}

// Chaque commande porte l'appareil émetteur (contrat docs/modules/registre-parcours-ux.md §5) ;
// l'en-tête X-Device-Id identifie le lot.
function toWireCommand(entry: OutboxEntry, deviceId: string) {
  return {
    id: entry.id,
    deviceId,
    type: entry.type,
    payload: entry.payload,
    idempotencyKey: entry.idempotencyKey,
    clientCreatedAt: entry.clientCreatedAt,
    dependsOn: entry.dependsOn,
    expectedVersion: entry.expectedVersion,
  };
}

export type { SyncResult };
