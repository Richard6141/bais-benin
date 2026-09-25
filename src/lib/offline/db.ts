import Dexie, { type EntityTable } from "dexie";
import type { SyncCommandType, SyncOutcome } from "@/modules/sync/commands";

// Base locale de la PWA (docs/modules/registre-parcours-ux.md §4). Une base par utilisateur :
// le nom porte l'identifiant du compte pour qu'un téléphone partagé ne mélange pas les saisies.

export type DraftKind = "FARM_ENROLMENT" | "PARCEL_CAPTURE" | "HARVEST_DECLARATION" | "FIELD_VISIT";
export type DraftStatus = "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";

export interface Draft {
  id: string;
  kind: DraftKind;
  step: number;
  data: Record<string, unknown>;
  farmId?: string;
  farmerId?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

export type OutboxStatus = "PENDING" | "SENDING" | SyncOutcome;

export interface OutboxEntry {
  id: string;
  type: SyncCommandType;
  payload: unknown;
  idempotencyKey: string;
  clientCreatedAt: string;
  sequence: number;
  dependsOn?: string[];
  expectedVersion?: number;
  status: OutboxStatus;
  attempts: number;
  lastError?: { code: string; message: string; field?: string };
  serverResult?: unknown;
  // Brouillon d'origine, pour rouvrir la saisie en cas de rejet.
  draftId?: string;
  updatedAt: string;
}

export interface ReferentielRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface LocalFarm {
  id: string;
  code: string;
  farmerId: string;
  farmerName: string;
  communeCode: string;
  communeName: string;
  verificationStatus: string;
  declaredAreaHa: number;
  parcelCount: number;
  cropCodes: string[];
  version: number;
  syncState: "SYNCED" | "LOCAL_ONLY" | "MODIFIED";
  updatedAt: string;
}

export class AgentDatabase extends Dexie {
  drafts!: EntityTable<Draft, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  referentiel!: EntityTable<ReferentielRecord, "key">;
  farms!: EntityTable<LocalFarm, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      drafts: "id, kind, status, updatedAt, farmId, farmerId",
      outbox: "id, status, sequence, clientCreatedAt, draftId",
      referentiel: "key",
      farms: "id, code, farmerId, communeCode, verificationStatus, syncState, updatedAt",
    });
  }
}

const databases = new Map<string, AgentDatabase>();

export function getAgentDatabase(userId: string): AgentDatabase {
  const name = `bais-agent-${userId}`;
  let db = databases.get(name);
  if (!db) {
    db = new AgentDatabase(name);
    databases.set(name, db);
  }
  return db;
}

// Efface la base d'un utilisateur (déconnexion, appareil révoqué).
export async function deleteAgentDatabase(userId: string): Promise<void> {
  const name = `bais-agent-${userId}`;
  databases.get(name)?.close();
  databases.delete(name);
  await Dexie.delete(name);
}
