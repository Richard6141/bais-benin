import { prisma } from "@/database/client";
import { authorize, type Actor } from "@/modules/authorization";
import { AlertAccessError } from "./acknowledge";
import type { Db } from "./plan";

// Exploitations concernées par une alerte, vues par l'agent (monitoring-parcours-ux §2.B, B2) :
// qui appeler ou visiter en premier. Le téléphone n'est renvoyé qu'avec le droit
// `farmer.contact.read` sur la commune ; l'ordre met en tête les producteurs sans téléphone et
// les envois en échec, puis les messages non lus, et enfin ceux qui ont lu ou été prévenus.

export type ChannelStatus =
  "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "RELAYED" | "SKIPPED";

export type AttentionReason = "NO_PHONE" | "DELIVERY_FAILED" | "UNREAD" | null;

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
  DELIVERY_FAILED: 1,
  UNREAD: 2,
  OK: 3,
};

export function attentionOf(
  farm: Pick<AffectedFarm, "hasPhone" | "channels" | "read" | "relay">,
): AttentionReason {
  if (farm.relay || farm.read) return null;
  if (!farm.hasPhone) return "NO_PHONE";
  const outbound = (["WHATSAPP", "SMS"] as const)
    .map((c) => farm.channels[c])
    .filter(Boolean) as ChannelStatus[];
  const succeeded = outbound.some((s) => SUCCESS.has(s));
  if (
    !succeeded &&
    (outbound.length === 0 || outbound.some((s) => s === "FAILED" || s === "SKIPPED"))
  ) {
    return "DELIVERY_FAILED";
  }
  return "UNREAD";
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
