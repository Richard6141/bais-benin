import type { AgentDatabase, OutboxEntry } from "./db";
import type { SyncCommandType, SyncPayload, SyncResult } from "@/modules/sync/commands";

// File d'attente des commandes (ADR-0005). Chaque saisie devient une commande immuable ;
// la synchronisation les envoie dans l'ordre de leur numéro de séquence.

export interface EnqueueInput<T extends SyncCommandType> {
  id: string;
  type: T;
  payload: SyncPayload[T];
  dependsOn?: string[];
  expectedVersion?: number;
  draftId?: string;
}

export async function enqueueCommand<T extends SyncCommandType>(
  db: AgentDatabase,
  input: EnqueueInput<T>,
): Promise<OutboxEntry> {
  const last = await db.outbox.orderBy("sequence").last();
  const now = new Date().toISOString();
  const entry: OutboxEntry = {
    id: input.id,
    type: input.type,
    payload: input.payload,
    idempotencyKey: input.id,
    clientCreatedAt: now,
    sequence: (last?.sequence ?? 0) + 1,
    dependsOn: input.dependsOn,
    expectedVersion: input.expectedVersion,
    status: "PENDING",
    attempts: 0,
    draftId: input.draftId,
    updatedAt: now,
  };
  await db.outbox.add(entry);
  return entry;
}

export async function pendingCommands(db: AgentDatabase, limit = 50): Promise<OutboxEntry[]> {
  const rows = await db.outbox.where("status").anyOf(["PENDING", "SENDING"]).sortBy("sequence");
  return rows.slice(0, limit);
}

export async function outboxCounts(
  db: AgentDatabase,
): Promise<{ pending: number; failed: number }> {
  const [pending, rejected, conflicts] = await Promise.all([
    db.outbox.where("status").anyOf(["PENDING", "SENDING"]).count(),
    db.outbox.where("status").equals("REJECTED").count(),
    db.outbox.where("status").equals("CONFLICT").count(),
  ]);
  return { pending, failed: rejected + conflicts };
}

export async function applyResults(db: AgentDatabase, results: SyncResult[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.outbox, db.farms, async () => {
    for (const result of results) {
      const entry = await db.outbox.get(result.id);
      if (!entry) continue;
      await db.outbox.update(result.id, {
        status: result.outcome,
        attempts: entry.attempts + 1,
        lastError: result.error,
        serverResult: result,
        updatedAt: now,
      });
      if (result.outcome === "APPLIED" || result.outcome === "DUPLICATE") {
        await reflectAppliedCommand(db, entry, result, now);
      }
    }
  });
}

// Une fois la commande appliquée, la copie locale prend les valeurs serveur : le code
// provisoire est remplacé par le code officiel, la version et l'état de synchronisation suivent.
async function reflectAppliedCommand(
  db: AgentDatabase,
  entry: OutboxEntry,
  result: SyncResult,
  now: string,
): Promise<void> {
  const payload = (entry.payload ?? {}) as Record<string, unknown>;
  if (entry.type === "farm.create" && typeof payload.id === "string") {
    await db.farms
      .where("id")
      .equals(payload.id)
      .modify((farm) => {
        if (result.entity?.code) farm.code = result.entity.code;
        if (result.entity?.version) farm.version = result.entity.version;
        farm.syncState = "SYNCED";
        farm.updatedAt = now;
      });
    return;
  }
  const farmId = typeof payload.farmId === "string" ? payload.farmId : null;
  if (farmId && entry.type === "verification.record") {
    const outcome = payload.outcome;
    await db.farms
      .where("id")
      .equals(farmId)
      .modify((farm) => {
        farm.syncState = "SYNCED";
        farm.updatedAt = now;
        if (outcome === "CONFIRMED" || outcome === "CORRECTED")
          farm.verificationStatus = "FIELD_VERIFIED";
        if (outcome === "REJECTED") farm.verificationStatus = "DISPUTED";
      });
  }
}

export async function markSending(db: AgentDatabase, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.outbox.where("id").anyOf(ids).modify({ status: "SENDING", updatedAt: now });
}

export async function markPendingAgain(
  db: AgentDatabase,
  ids: string[],
  error?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.outbox
    .where("id")
    .anyOf(ids)
    .modify((entry) => {
      entry.status = "PENDING";
      entry.attempts += 1;
      entry.updatedAt = now;
      if (error) entry.lastError = { code: "NETWORK", message: error };
    });
}

// Les commandes appliquées sont conservées sept jours pour l'historique, puis purgées.
export async function purgeApplied(db: AgentDatabase, olderThanDays = 7): Promise<number> {
  const threshold = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  return db.outbox
    .where("status")
    .anyOf(["APPLIED", "DUPLICATE"])
    .and((entry) => entry.updatedAt < threshold)
    .delete();
}

// Remet en attente des commandes rejetées ou en conflit, après correction ou décision de l'agent.
export async function retryCommands(db: AgentDatabase, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.outbox
    .where("id")
    .anyOf(ids)
    .modify((entry) => {
      entry.status = "PENDING";
      entry.lastError = undefined;
      entry.updatedAt = now;
    });
}

// Abandonne une commande en erreur : elle ne partira plus et le brouillon reste consultable.
export async function discardCommands(db: AgentDatabase, ids: string[]): Promise<number> {
  return db.outbox.where("id").anyOf(ids).delete();
}
