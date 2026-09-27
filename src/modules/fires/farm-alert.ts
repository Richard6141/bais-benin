import { prisma } from "@/database/client";
import { FIRE_ALERT_WINDOW_MS, nearestFiresForFarms } from "@/database/sql/fires.sql";
import { authorize, type Actor } from "@/modules/authorization";
import { fireMessageInApp, fireSeverity } from "@/modules/monitoring/fire-message";

// Carte d'alerte feu de l'accueil agriculteur (chantier K) : rien tant qu'aucun feu actif ne
// menace l'exploitation, sinon le feu le plus proche, où il est par rapport à SA parcelle et le
// conseil de l'alerte. Même calcul que le message envoyé (fire-message.ts), fait à l'affichage.

export interface FarmFireAlert {
  alertId: string;
  /** Gravité pour cette exploitation : critique sous 500 m de sa parcelle. */
  severity: "INFO" | "WATCH" | "WARNING" | "CRITICAL";
  /** Où et quand, depuis sa parcelle, puis la limite de la détection. */
  situation: string;
  adviceFr: string;
  detectedAt: string;
  distanceM: number;
  fire: { lng: number; lat: number };
  farm: { lng: number; lat: number };
}

/**
 * Null tant que rien ne menace l'exploitation : ni alerte de feu active pour sa commune, ni
 * exploitation retenue comme destinataire, ni feu récent (confiance nominale ou haute) à moins
 * d'1 km d'une de ses parcelles.
 */
export async function getFarmFireAlert(
  actor: Actor,
  farmId: string,
  now: Date = new Date(),
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
    select: { id: true, adviceFr: true },
  });
  if (!alert) return null;

  const recipient = await prisma.alertRecipient.findFirst({
    where: { alertId: alert.id, farmId },
    select: { id: true },
  });
  if (!recipient) return null;

  const nearest = (
    await nearestFiresForFarms([farmId], new Date(now.getTime() - FIRE_ALERT_WINDOW_MS))
  ).get(farmId);
  if (!nearest) return null;

  return {
    alertId: alert.id,
    severity: fireSeverity(nearest.distanceM),
    situation: fireMessageInApp(nearest, now),
    adviceFr: alert.adviceFr,
    detectedAt: nearest.detectedAt.toISOString(),
    distanceM: Math.round(nearest.distanceM),
    fire: { lng: nearest.fire.lon, lat: nearest.fire.lat },
    farm: { lng: nearest.parcel.lon, lat: nearest.parcel.lat },
  };
}
