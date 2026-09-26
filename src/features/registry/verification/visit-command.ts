import type { GeoPosition } from "@/components/forms/location-picker";
import { parseAmount } from "@/components/forms/unit-amount-field";
import type { AgentDatabase } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";

export type VisitOutcome = "CONFIRMED" | "CORRECTED" | "REJECTED";

export interface VisitInput {
  farmId: string;
  identityConfirmed: boolean;
  outcome: VisitOutcome;
  position: GeoPosition | null;
  correctedArea: string;
  notes: string;
  /** Culture vue par parcelle ; une parcelle absente n'a pas été vue. */
  observedCrops?: { parcelId: string; cropCode: string }[];
  now?: Date;
}

export type BuiltVisit =
  | {
      ok: true;
      payload: SyncPayload["verification.record"];
      enqueue: (db: AgentDatabase) => Promise<void>;
    }
  | { ok: false; error: string };

// Traduit le formulaire de visite en commande `verification.record` (docs/modules/registre-parcours-ux.md §5).
// Les règles métier de l'écran D4 sont ici pour être testées sans interface.
export function buildVerificationCommand(input: VisitInput): BuiltVisit {
  const notes = input.notes.trim();
  if (input.outcome === "REJECTED" && notes.length === 0) {
    return { ok: false, error: "Une note est nécessaire pour un rejet." };
  }
  if (!input.identityConfirmed && input.outcome !== "REJECTED") {
    return {
      ok: false,
      error: "Confirmez l'identité du producteur avant de valider, ou rejetez la visite.",
    };
  }
  let correctedDeclaredAreaHa: number | undefined;
  if (input.outcome === "CORRECTED") {
    const parsed = parseAmount(input.correctedArea);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, error: "Indiquez la superficie constatée, supérieure à 0." };
    }
    correctedDeclaredAreaHa = parsed;
  }
  const payload: SyncPayload["verification.record"] = {
    id: crypto.randomUUID(),
    farmId: input.farmId,
    kind: "FIELD_VISIT",
    outcome: input.outcome,
    notes: notes.length > 0 ? notes : undefined,
    visitedAt: (input.now ?? new Date()).toISOString(),
    gpsPoint: input.position ? [input.position.lng, input.position.lat] : undefined,
    identityConfirmed: input.identityConfirmed,
    correctedDeclaredAreaHa,
    // Une visite rejetée ne dit rien des cultures.
    observedCrops:
      input.outcome !== "REJECTED" && input.observedCrops?.length ? input.observedCrops : undefined,
  };
  return {
    ok: true,
    payload,
    enqueue: async (db) => {
      await enqueueCommand(db, { id: payload.id, type: "verification.record", payload });
      await db.farms
        .where("id")
        .equals(input.farmId)
        .modify({ syncState: "MODIFIED", updatedAt: payload.visitedAt });
    },
  };
}
