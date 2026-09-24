import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import { parseSyncCommand, type SyncCommand, type SyncOutcome } from "./commands";
import { syncHandlers } from "./handlers";
import type {
  Db,
  HandlerOutcome,
  SyncApplyResult,
  SyncContext,
  SyncHandlers,
} from "./handlers/types";

// Serveur de synchronisation (ADR-0005, docs/modules/registre-parcours-ux.md §5).
// Un lot est traité commande par commande, dans l'ordre :
// 1. validation du contrat (enveloppe puis charge utile) ;
// 2. idempotence : une clé déjà appliquée renvoie le résultat mémorisé (DUPLICATE) ; une clé
//    dont la précédente tentative avait échoué est retentée, le client ayant pu corriger ;
// 3. dépendances : une commande dont une dépendance du lot a échoué est refusée ;
// 4. autorisation sur la cible réelle (commune, département, propriétaire) ;
// 5. application dans une transaction, avec fil d'activité et journal de commandes ;
// 6. audit hors transaction, jamais bloquant.

const FAILED: ReadonlySet<SyncOutcome> = new Set(["REJECTED", "CONFLICT"]);

/** Accès à la base et aux handlers, injectables pour les tests unitaires. */
export interface SyncApplierDeps {
  db: Pick<typeof prisma, "$transaction" | "syncCommand">;
  handlers: SyncHandlers;
  now?: () => Date;
}

function toJson(result: SyncApplyResult): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
}

function fromStored(id: string, stored: Prisma.JsonValue | null): SyncApplyResult {
  const base = (stored ?? {}) as Partial<SyncApplyResult>;
  return { ...base, id, outcome: "DUPLICATE" };
}

async function persistCommand(
  db: Pick<typeof prisma, "syncCommand"> | Db,
  command: SyncCommand,
  userId: string,
  deviceId: string,
  result: SyncApplyResult,
  appliedAt: Date | null,
): Promise<void> {
  const data = {
    deviceId,
    userId,
    commandType: command.type,
    payload: command.payload as Prisma.InputJsonValue,
    clientCreatedAt: new Date(command.clientCreatedAt),
    appliedAt,
    outcome: result.outcome,
    result: toJson(result),
  };
  await db.syncCommand.upsert({
    where: { idempotencyKey: command.idempotencyKey },
    create: { id: command.id, idempotencyKey: command.idempotencyKey, ...data },
    update: data,
  });
}

function outcomeToResult(id: string, outcome: HandlerOutcome): SyncApplyResult {
  switch (outcome.outcome) {
    case "APPLIED":
      return { id, outcome: "APPLIED", entity: outcome.entity, warnings: outcome.warnings };
    case "DUPLICATE":
      return { id, outcome: "DUPLICATE", entity: outcome.entity };
    case "REJECTED":
      return { id, outcome: "REJECTED", error: outcome.error };
    case "CONFLICT":
      return { id, outcome: "CONFLICT", conflict: outcome.conflict };
  }
}

export function createSyncApplier(deps: SyncApplierDeps) {
  const now = deps.now ?? (() => new Date());

  async function applyOne(
    command: SyncCommand,
    context: SyncContext,
    batchOutcomes: ReadonlyMap<string, SyncOutcome>,
  ): Promise<SyncApplyResult> {
    const failedDependency = (command.dependsOn ?? []).find((dependencyId) =>
      FAILED.has(batchOutcomes.get(dependencyId) ?? "APPLIED"),
    );
    if (failedDependency) {
      return {
        id: command.id,
        outcome: "REJECTED",
        error: {
          code: "DEPENDENCY_FAILED",
          message: `La commande ${failedDependency} dont dépend celle-ci n'a pas été appliquée`,
        },
      };
    }

    const stored = await deps.db.syncCommand.findUnique({
      where: { idempotencyKey: command.idempotencyKey },
      select: { outcome: true, result: true },
    });
    if (stored && !FAILED.has(stored.outcome)) {
      return fromStored(command.id, stored.result);
    }

    const handler = deps.handlers[command.type] as (typeof deps.handlers)[typeof command.type];
    let result: SyncApplyResult;
    let appliedAt: Date | null = null;
    let audit: Extract<HandlerOutcome, { outcome: "APPLIED" }>["audit"] | null = null;
    try {
      result = await deps.db.$transaction(async (tx) => {
        const target = await handler.target(command as never, tx);
        if (!target) {
          return {
            id: command.id,
            outcome: "REJECTED",
            error: { code: "NOT_FOUND", message: "L'entité visée par la commande n'existe pas" },
          } satisfies SyncApplyResult;
        }
        const decision = authorize(context.actor, target.action, target.resource);
        if (!decision.allowed) {
          return {
            id: command.id,
            outcome: "REJECTED",
            error: { code: "FORBIDDEN", message: decision.reason },
          } satisfies SyncApplyResult;
        }

        const outcome = await handler.apply(command as never, tx, context);
        const applied = outcomeToResult(command.id, outcome);
        if (outcome.outcome === "APPLIED") {
          appliedAt = now();
          audit = outcome.audit;
          if (outcome.farmId && outcome.eventKind) {
            await tx.farmEvent.create({
              data: {
                farmId: outcome.farmId,
                kind: outcome.eventKind,
                payload: outcome.eventPayload ?? undefined,
                actorId: context.actor.userId,
                occurredAt: new Date(command.clientCreatedAt),
              },
            });
          }
          await persistCommand(
            tx,
            command,
            context.actor.userId,
            context.deviceId,
            applied,
            appliedAt,
          );
        }
        return applied;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur interne";
      result = {
        id: command.id,
        outcome: "REJECTED",
        error: { code: "INTERNAL_ERROR", message: `Application impossible : ${message}` },
      };
    }

    if (result.outcome !== "APPLIED" && result.outcome !== "DUPLICATE") {
      await persistCommand(deps.db, command, context.actor.userId, context.deviceId, result, null);
    }
    if (audit) {
      const entry = audit as Extract<HandlerOutcome, { outcome: "APPLIED" }>["audit"];
      await recordAudit({
        action: entry.action,
        actorId: context.actor.userId,
        resourceType: result.entity?.type,
        resourceId: result.entity?.id,
        details: entry.details,
      });
    }
    return result;
  }

  return async function applySyncBatch(
    actor: Actor,
    deviceId: string,
    commands: readonly unknown[],
  ): Promise<SyncApplyResult[]> {
    const context: SyncContext = { actor, deviceId, now: now() };
    const results: SyncApplyResult[] = [];
    const outcomes = new Map<string, SyncOutcome>();

    for (const [index, raw] of commands.entries()) {
      const parsed = parseSyncCommand(raw);
      if (!parsed.ok) {
        const id = parsed.id ?? `commande-${index + 1}`;
        results.push({ id, outcome: "REJECTED", error: parsed.error });
        outcomes.set(id, "REJECTED");
        continue;
      }
      const result = await applyOne(parsed.command, context, outcomes);
      results.push(result);
      outcomes.set(parsed.command.id, result.outcome);
    }

    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {});
    await recordAudit({
      action: "sync.batch.received",
      actorId: actor.userId,
      resourceType: "device",
      resourceId: deviceId,
      details: { commands: commands.length, ...counts },
    });
    return results;
  };
}

/** Applicateur par défaut, branché sur la base et les handlers du registre. */
export const applySyncBatch = createSyncApplier({ db: prisma, handlers: syncHandlers });
