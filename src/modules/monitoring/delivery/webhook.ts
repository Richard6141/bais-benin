import { z } from "zod";
import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import type { Db } from "./plan";

// Événements entrants de wapy.pro (docs/09 §1, « Webhook entrant »).
// - `remise` (documenté) : même objet que GET /pont/v1/messages/{id}, avec `remise` qui vaut
//   acceptee, serveur, appareil, lu ou echec. appareil → DELIVERED, lu → READ, echec → FAILED.
// - `reponse` (contrat BAIS, non documenté par wapy.pro à ce jour) : réponse texte d'un
//   destinataire. « OK », « oui », « d'accord » valent accusé de lecture de l'alerte la plus
//   récente envoyée à ce numéro dans les 72 heures.
// Un événement qui ne correspond à aucun envoi connu est ignoré sans erreur (le fournisseur ne
// doit pas le renvoyer en boucle).

const deliveryEventSchema = z.object({
  evenement: z.literal("remise"),
  message_id: z.string().min(1),
  remise: z.enum(["acceptee", "serveur", "appareil", "lu", "echec"]),
  remise_le: z.string().optional(),
  motif: z.string().nullish(),
});

const replyEventSchema = z.object({
  evenement: z.literal("reponse"),
  de: z.string().regex(/^\+\d{8,15}$/),
  texte: z.string().max(1000),
  message_id: z.string().optional(),
  recu_le: z.string().optional(),
});

export const wapyEventSchema = z.discriminatedUnion("evenement", [
  deliveryEventSchema,
  replyEventSchema,
]);
export type WapyEvent = z.infer<typeof wapyEventSchema>;

export type WebhookResult =
  | { handled: true; kind: "remise" | "reponse"; updated: number }
  | { handled: false; reason: string };

const ACK_WORDS = new Set(["ok", "oui", "daccord", "d'accord", "compris", "merci"]);
const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

// Fenêtre de fraîcheur sur l'horodatage signé (remise_le / recu_le, couvert par la signature
// HMAC du corps puisqu'il en fait partie) : un événement rejoué plus tard qu'elle est refusé.
// Défense en profondeur plutôt que la seule protection contre le rejeu — les transitions de
// statut sont déjà non régressives (voir `blocked` plus bas) et l'accusé de lecture ne
// s'applique qu'une fois (acknowledgedAt: null) — mais un horodatage hors fenêtre est en
// lui-même un signal net d'anomalie, qu'il vienne d'un rejeu ou d'une horloge cassée chez
// l'émetteur. Un événement sans horodatage (champ optionnel, compatibilité) n'est pas soumis à
// cette vérification : rien à comparer.
const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

function isFresh(value: string | undefined, now: Date): boolean {
  if (!value) return true;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return true;
  return Math.abs(now.getTime() - at.getTime()) <= FRESHNESS_WINDOW_MS;
}

export function isAcknowledgementReply(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z' ]/g, "")
    .trim();
  return ACK_WORDS.has(normalized) || ACK_WORDS.has(normalized.replace(/'/g, ""));
}

function toDate(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function applyWapyEvent(
  event: WapyEvent,
  now = new Date(),
  db: Db = prisma,
): Promise<WebhookResult> {
  const signedTimestamp = event.evenement === "remise" ? event.remise_le : event.recu_le;
  if (!isFresh(signedTimestamp, now)) {
    return { handled: false, reason: "Horodatage hors fenêtre de fraîcheur (rejeu potentiel)" };
  }

  if (event.evenement === "remise") {
    const at = toDate(event.remise_le, now);
    const data =
      event.remise === "appareil"
        ? { status: "DELIVERED" as const, deliveredAt: at }
        : event.remise === "lu"
          ? { status: "READ" as const, deliveredAt: at, acknowledgedAt: at }
          : event.remise === "echec"
            ? {
                status: "FAILED" as const,
                failureReason: event.motif ?? "Échec de remise signalé par wapy.pro",
              }
            : null;
    if (!data) return { handled: true, kind: "remise", updated: 0 };
    // Un statut ne régresse jamais : un message lu ne redevient pas « remis ».
    const blocked =
      data.status === "DELIVERED"
        ? ["READ", "RELAYED"]
        : data.status === "FAILED"
          ? ["DELIVERED", "READ", "RELAYED"]
          : ["RELAYED"];
    const result = await db.alertRecipient.updateMany({
      where: { providerMessageId: event.message_id, status: { notIn: blocked as never } },
      data,
    });
    return result.count > 0
      ? { handled: true, kind: "remise", updated: result.count }
      : { handled: false, reason: "Message inconnu ou statut déjà plus avancé" };
  }

  if (!isAcknowledgementReply(event.texte))
    return { handled: false, reason: "Réponse sans accusé de lecture" };
  const at = toDate(event.recu_le, now);
  const latest = await db.alertRecipient.findFirst({
    where: {
      phoneE164: event.de,
      channel: { in: ["WHATSAPP", "SMS"] },
      sentAt: { gte: new Date(at.getTime() - REPLY_WINDOW_MS) },
      alert: { status: "ACTIVE" },
    },
    orderBy: { sentAt: "desc" },
    select: { alertId: true, farmId: true },
  });
  if (!latest) return { handled: false, reason: "Aucune alerte récente envoyée à ce numéro" };
  const result = await db.alertRecipient.updateMany({
    where: {
      alertId: latest.alertId,
      farmId: latest.farmId,
      status: { notIn: ["FAILED", "SKIPPED", "RELAYED"] },
      acknowledgedAt: null,
    },
    data: { status: "READ", acknowledgedAt: at },
  });
  await recordAudit({
    action: "alert.acknowledged",
    resourceType: "alert",
    resourceId: latest.alertId,
    details: { via: "whatsapp_reply", farmId: latest.farmId, rows: result.count },
  });
  return { handled: true, kind: "reponse", updated: result.count };
}
