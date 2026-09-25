import { prisma } from "@/database/client";
import { authorize, type Actor } from "@/modules/authorization";
import { AlertAccessError } from "./acknowledge";
import type { Db } from "./plan";

// Exploitations concernées par une alerte, vues par l'agent (monitoring-parcours-ux §2.B, B2) :
// qui appeler ou visiter en premier. Le téléphone n'est renvoyé qu'avec le droit
// `farmer.contact.read` sur la commune ; l'ordre met en tête les producteurs sans téléphone ou à
// prévenir de vive voix, puis les échecs, les messages non envoyés, les non lus, et enfin ceux
// qui ont lu ou été prévenus.

export type ChannelStatus =
  "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "RELAYED" | "SKIPPED";

/**
 * Pourquoi l'agent doit s'occuper d'une exploitation, du plus urgent au moins urgent :
 * - NO_PHONE : aucun numéro, seul un passage ou un appel à un proche peut prévenir ;
 * - TO_CALL : « à prévenir de vive voix », aucun canal n'a abouti et aucun relais n'est prévu ;
 * - DELIVERY_FAILED : un envoi a réellement échoué et aucun autre canal n'a abouti ;
 * - NOT_SENT : « non envoyé », le message n'est pas parti (canal écarté, alerte de
 *   démonstration, pas de consentement) mais un relais par l'agent est prévu ;
 * - UNREAD : un canal a abouti (message ou application) ou est encore en file, pas encore lu.
 * Un envoi écarté (SKIPPED) n'est jamais compté comme un échec.
 */
export type AttentionReason =
  "NO_PHONE" | "TO_CALL" | "DELIVERY_FAILED" | "NOT_SENT" | "UNREAD" | null;

export interface AffectedFarm {
  farmId: string;
  farmCode: string;
  farmerName: string;
  village: string | null;
  /** Numéro E.164, seulement avec le droit de lire les contacts. */
  phone: string | null;
  hasPhone: boolean;
  channels: Partial<Record<"IN_APP" | "WHATSAPP" | "SMS" | "RELAY", ChannelStatus>>;
  read: boolean;
  relay: { byName: string | null; mode: string | null; at: Date | null } | null;
  attention: AttentionReason;
}

const SUCCESS = new Set<ChannelStatus>(["SENT", "DELIVERED", "READ"]);
const ATTENTION_ORDER: Record<Exclude<AttentionReason, null> | "OK", number> = {
  NO_PHONE: 0,
  TO_CALL: 1,
  DELIVERY_FAILED: 2,
  NOT_SENT: 3,
  UNREAD: 4,
  OK: 5,
};

export function attentionOf(
  farm: Pick<AffectedFarm, "hasPhone" | "channels" | "read" | "relay">,
): AttentionReason {
  if (farm.relay || farm.read) return null;
  if (!farm.hasPhone) return "NO_PHONE";
  const { IN_APP, WHATSAPP, SMS, RELAY } = farm.channels;
  const outbound = [WHATSAPP, SMS].filter(Boolean) as ChannelStatus[];
  // Un message parti, ou encore en file (silence nocturne, relance), n'attend que sa lecture.
  const reaching = [...outbound, IN_APP].filter(Boolean) as ChannelStatus[];
  if (reaching.some((s) => SUCCESS.has(s) || s === "PENDING")) return "UNREAD";
  if (outbound.some((s) => s === "FAILED")) return "DELIVERY_FAILED";
  const relayPlanned = RELAY !== undefined && RELAY !== "SKIPPED" && RELAY !== "FAILED";
  return relayPlanned ? "NOT_SENT" : "TO_CALL";
}

export function sortAffectedFarms(farms: AffectedFarm[]): AffectedFarm[] {
  return [...farms].sort(
    (a, b) =>
      ATTENTION_ORDER[a.attention ?? "OK"] - ATTENTION_ORDER[b.attention ?? "OK"] ||
      a.farmerName.localeCompare(b.farmerName, "fr"),
  );
}

export async function listAffectedFarms(
  actor: Actor,
  alertId: string,
  db: Db = prisma,
): Promise<AffectedFarm[]> {
  const alert = await db.alert.findUnique({
    where: { id: alertId },
    select: { communeId: true, commune: { select: { departementId: true } } },
  });
  if (!alert) throw new AlertAccessError("NOT_FOUND", "Alerte introuvable");
  const resource = { communeId: alert.communeId, departementId: alert.commune.departementId };
  // L'agent et le ministère lisent la liste ; un producteur n'y a pas accès (portée SELF).
  const decision = authorize(actor, "alert.relay", resource);
  if (!decision.allowed) throw new AlertAccessError("FORBIDDEN", decision.reason);
  const canReadContacts = authorize(actor, "farmer.contact.read", resource).allowed;

  const rows = await db.alertRecipient.findMany({
    where: { alertId, farmId: { not: null } },
    select: {
      farmId: true,
      channel: true,
      status: true,
      acknowledgedAt: true,
      relayMode: true,
      relayedById: true,
      farm: {
        select: {
          code: true,
          village: true,
          farmer: { select: { firstName: true, lastName: true, phoneE164: true } },
        },
      },
    },
  });
  const relayerIds = [
    ...new Set(rows.map((r) => r.relayedById).filter((id): id is string => Boolean(id))),
  ];
  const relayers = relayerIds.length
    ? await db.user.findMany({
        where: { id: { in: relayerIds } },
        select: { id: true, name: true },
      })
    : [];
  const relayerName = new Map(relayers.map((u) => [u.id, u.name]));

  const byFarm = new Map<string, AffectedFarm>();
  for (const row of rows) {
    if (!row.farmId || !row.farm) continue;
    const farm =
      byFarm.get(row.farmId) ??
      ({
        farmId: row.farmId,
        farmCode: row.farm.code,
        farmerName: `${row.farm.farmer.firstName} ${row.farm.farmer.lastName}`,
        village: row.farm.village,
        phone: canReadContacts ? row.farm.farmer.phoneE164 : null,
        hasPhone: Boolean(row.farm.farmer.phoneE164),
        channels: {},
        read: false,
        relay: null,
        attention: null,
      } satisfies AffectedFarm);
    farm.channels[row.channel] = row.status as ChannelStatus;
    if (row.status === "READ") farm.read = true;
    if (row.channel === "RELAY" && row.status === "RELAYED") {
      farm.relay = {
        byName: row.relayedById ? (relayerName.get(row.relayedById) ?? null) : null,
        mode: row.relayMode,
        at: row.acknowledgedAt,
      };
    }
    byFarm.set(row.farmId, farm);
  }
  const farms = [...byFarm.values()].map((farm) => ({ ...farm, attention: attentionOf(farm) }));
  return sortAffectedFarms(farms);
}
