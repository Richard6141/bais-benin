import type { Prisma } from "@/generated/prisma/client";
import type { ActionCode, Actor, ResourceRef, RoleCode } from "@/modules/authorization";
import type { SyncCommand, SyncCommandType, SyncResult } from "../commands";

/** Client Prisma transactionnel : chaque commande s'applique dans sa propre transaction. */
export type Db = Prisma.TransactionClient;

/** Ce qui est stable pour tout un lot : connu avant même de savoir quelle commande on traite. */
export interface BatchContext {
  actor: Actor;
  deviceId: string;
  now: Date;
}

export interface SyncContext extends BatchContext {
  /**
   * C2 : rôle du grant qui a autorisé CETTE commande précise (apply.ts appelle authorize() par
   * commande et en garde le résultat) — jamais l'ensemble des rôles de l'acteur. Un handler ne
   * doit déduire une fiabilité de terrain (FIELD_VERIFIED, AGENT_VERIFIED) que de cette valeur,
   * jamais d'un champ envoyé par le client (captureMethod, declaredBy) : sinon un agriculteur
   * pourrait s'auto-attribuer le statut réservé à la visite d'un agent.
   */
  grantRole: RoleCode;
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
  | "alert.relayed"
  | "report.created";

/** Cible d'une commande : l'action à autoriser et la ressource sur laquelle l'évaluer. */
export interface CommandTarget {
  action: ActionCode;
  resource: ResourceRef;
  /**
   * C2 : la cible est une entité désignée par son identifiant (exploitation, parcelle, alerte).
   * Un refus d'autorisation y répond alors comme une absence (NOT_FOUND), pour ne pas révéler
   * qu'un identifiant hors périmètre existe. Une commune, publique, garde un refus explicite.
   */
  byId?: boolean;
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

/**
 * C2 : l'identifiant fourni par le client existe déjà, mais pour une autre entité que celle que
 * la commande vise (autre exploitation, autre parcelle). Répondre DUPLICATE avec cette entité
 * renverrait son code et sa version à qui ne la lit pas forcément : on refuse sans rien en dire.
 */
export function idConflict(): HandlerOutcome {
  return rejected("ID_CONFLICT", "Cet identifiant est déjà utilisé par une autre saisie", "id");
}
