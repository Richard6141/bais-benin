import type { Prisma } from "@/generated/prisma/client";
import type { ActionCode, Actor, ResourceRef } from "@/modules/authorization";
import type { SyncCommand, SyncCommandType, SyncResult } from "../commands";

/** Client Prisma transactionnel : chaque commande s'applique dans sa propre transaction. */
export type Db = Prisma.TransactionClient;

export interface SyncContext {
  actor: Actor;
  deviceId: string;
  now: Date;
}

/** Résultat d'une commande, enrichi des avertissements non bloquants (écarts de surface, unités). */
export interface SyncApplyResult extends SyncResult {
  warnings?: string[];
}

/** Ce qu'un handler renvoie une fois la commande appliquée, avant journalisation. */
export type HandlerOutcome =
  | {
      outcome: "APPLIED";
      entity: NonNullable<SyncResult["entity"]>;
      /** Exploitation concernée, pour le fil d'activité ; absente pour un agriculteur seul. */
      farmId?: string;
      eventKind?: string;
      eventPayload?: Prisma.InputJsonValue;
      audit: { action: AuditActionOfRegistry; details?: Prisma.InputJsonValue };
      warnings?: string[];
    }
  | { outcome: "DUPLICATE"; entity: NonNullable<SyncResult["entity"]> }
  | { outcome: "REJECTED"; error: NonNullable<SyncResult["error"]> }
  | { outcome: "CONFLICT"; conflict: NonNullable<SyncResult["conflict"]> };

export type AuditActionOfRegistry =
  | "registry.farmer.created"
  | "registry.farm.created"
  | "registry.parcel.created"
  | "registry.crop.declared"
  | "registry.harvest.declared"
  | "registry.farm.verified"
  | "alert.relayed";

/** Cible d'une commande : l'action à autoriser et la ressource sur laquelle l'évaluer. */
export interface CommandTarget {
  action: ActionCode;
  resource: ResourceRef;
}

export interface SyncHandler<T extends SyncCommandType> {
  /** Résout la cible d'autorisation ; null si l'entité visée n'existe pas (REJECTED NOT_FOUND). */
  target(command: SyncCommand<T>, db: Db): Promise<CommandTarget | null>;
  apply(command: SyncCommand<T>, db: Db, context: SyncContext): Promise<HandlerOutcome>;
}

export type SyncHandlers = { [K in SyncCommandType]: SyncHandler<K> };

/** Provenance commune à toute saisie terrain synchronisée. */
export const FIELD_SOURCE_ID = "ATDA_TERRAIN";

export function rejected(code: string, message: string, field?: string): HandlerOutcome {
  return { outcome: "REJECTED", error: { code, message, field } };
}
