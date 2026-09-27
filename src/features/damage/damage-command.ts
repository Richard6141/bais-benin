import type { AgentDatabase } from "@/lib/offline/db";
import { enqueueCommand } from "@/lib/offline/outbox";
import type { SyncPayload } from "@/modules/sync/commands";

// Déclaration de sinistre (ADR-0038 §2) confirmée ou écartée sur place, traduite en commande
// `damageDeclaration.review`. Les règles de l'écran sont ici pour être testées sans interface ;
// le serveur refait les contrôles.

export type DamageDecision = "CONFIRMED" | "REJECTED";
export type DamageStage = SyncPayload["damageDeclaration.review"]["cropStage"];

export interface DamageReviewInput {
  declarationId: string;
  decision: DamageDecision | null;
  /** Surface brûlée constatée, en hectares, telle que saisie (virgule acceptée). */
  observedAreaHa: string;
  cropCode: string;
  cropStage: string;
  note: string;
  reason: string;
  now?: Date;
}

export type BuiltDamageReview =
  | {
      ok: true;
      payload: SyncPayload["damageDeclaration.review"];
      enqueue: (db: AgentDatabase) => Promise<void>;
    }
  | { ok: false; error: string };

/** Nombre saisi avec une virgule ou un point ; null s'il n'est pas lisible. */
export function parseHectares(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function buildDamageReview(input: DamageReviewInput): BuiltDamageReview {
  if (!input.decision) return { ok: false, error: "Dites si le sinistre est confirmé ou écarté." };
  const note = input.note.trim();
  if (input.decision === "REJECTED") {
    const reason = input.reason.trim();
    if (reason.length < 3) {
      return {
        ok: false,
        error: "Dites pourquoi le sinistre est écarté (brûlis volontaire, pas de dégât).",
      };
    }
    return withEnqueue({
      id: input.declarationId,
      decision: "REJECTED",
      reason,
      note: note || undefined,
      reviewedAt: (input.now ?? new Date()).toISOString(),
    });
  }
  const area = parseHectares(input.observedAreaHa);
  if (area === null)
    return { ok: false, error: "Donnez la surface brûlée constatée, en hectares." };
  return withEnqueue({
    id: input.declarationId,
    decision: "CONFIRMED",
    observedAreaHa: area,
    cropCode: input.cropCode || undefined,
    cropStage: (input.cropStage || undefined) as DamageStage,
    note: note || undefined,
    reviewedAt: (input.now ?? new Date()).toISOString(),
  });
}

function withEnqueue(payload: SyncPayload["damageDeclaration.review"]): BuiltDamageReview {
  return {
    ok: true,
    payload,
    enqueue: async (db) => {
      // Un double envoi de la même décision est un doublon côté serveur, sans effet.
      await enqueueCommand(db, {
        id: crypto.randomUUID(),
        type: "damageDeclaration.review",
        payload,
      });
    },
  };
}
