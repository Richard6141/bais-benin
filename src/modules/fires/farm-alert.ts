import { prisma } from "@/database/client";
import { nearestFireForFarm } from "@/database/sql/farm-fire.sql";
import { authorize, type Actor } from "@/modules/authorization";

// Carte d'alerte feu de l'accueil agriculteur (chantier K) : rien tant qu'aucun feu actif ne
// menace l'exploitation, sinon le feu le plus proche, sa distance et le conseil de l'alerte.

export interface FarmFireAlert {
  alertId: string;
  severity: "INFO" | "WATCH" | "WARNING" | "CRITICAL";
  messageShort: string;
  adviceFr: string;
  detectedAt: string;
  distanceM: number;
  fire: { lng: number; lat: number };
  farm: { lng: number; lat: number };
}

/**
 * Null tant que rien ne menace l'exploitation : ni alerte de feu active pour sa commune, ni
 * exploitation retenue comme destinataire, ni feu récent à moins d'1 km d'une de ses parcelles.
 */
export async function getFarmFireAlert(
  actor: Actor,
  farmId: string,
): Promise<FarmFireAlert | null> {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: {
      communeId: true,
      registeredById: true,
      farmer: { select: { userId: true } },
    },
  });
  if (!farm) return null;
  const decision = authorize(actor, "farm.read", {
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    communeId: farm.communeId,
  });
  if (!decision.allowed) return null;

  const alert = await prisma.alert.findFirst({
    where: {
      communeId: farm.communeId,
      category: "FIRE",
      status: "ACTIVE",
      awaitingConfirmation: false,
    },
    orderBy: { startsAt: "desc" },
    select: { id: true, severity: true, messageShort: true, adviceFr: true },
  });
  if (!alert) return null;

  const recipient = await prisma.alertRecipient.findFirst({
    where: { alertId: alert.id, farmId },
    select: { id: true },
  });
  if (!recipient) return null;

  const nearest = await nearestFireForFarm(farmId);
  if (!nearest) return null;

  return {
    alertId: alert.id,
    severity: alert.severity,
    messageShort: alert.messageShort,
    adviceFr: alert.adviceFr,
    detectedAt: nearest.detectedAt.toISOString(),
    distanceM: Math.round(nearest.distanceM),
    fire: { lng: nearest.fireLng, lat: nearest.fireLat },
    farm: { lng: nearest.farmLng, lat: nearest.farmLat },
  };
}
