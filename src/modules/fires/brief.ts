import { prisma } from "@/database/client";
import {
  cropsDeclaredByFarms,
  farmsNearFireDetection,
  FIRE_BRIEF_NEAR_RADIUS_M,
  notifiedFarmsCount,
} from "@/database/sql/fire-brief.sql";
import type { Actor } from "@/modules/authorization";
import { alertCommuneIds } from "@/modules/monitoring/alerts";

// Fiche courte d'un feu détecté, ouverte au clic sur la carte (/carte et /pilotage/veille,
// chantier K). Le feu et l'heure de passage restent visibles à tous ; les exploitations qu'il
// menace et les producteurs prévenus suivent la portée territoriale des alertes (public : national,
// rien de nominatif ; ministère : tout le pays ; agent : son périmètre, foyer par foyer pour un
// producteur). Sans acteur (page publique, sans session), la portée est nationale : ces chiffres
// sont déjà publics sur la carte (exploitations par commune), seuls les noms ne le sont jamais.
export interface FireBrief {
  id: string;
  detectedAt: string;
  confidence: string;
  communeName: string;
  /** Faux si le feu se trouve hors du périmètre de l'acteur : les comptes restent à zéro. */
  inScope: boolean;
  farmsWithin500m: number;
  farmsWithin1km: number;
  /** Cultures déclarées de la campagne ouverte parmi ces exploitations, triées. */
  crops: string[];
  /** Producteurs prévenus (message parti, livré ou lu) pour l'alerte de feu active de la commune. */
  notified: number;
  /** Fiche de l'alerte active, adaptée au rôle de l'acteur ; null sans alerte ou sans accès. */
  alertHref: string | null;
}

function alertHrefFor(actor: Actor | null, alertId: string): string | null {
  if (!actor) return null;
  const roles = actor.grants.map((g) => g.role);
  if (roles.includes("ADMIN_STATE")) return `/pilotage/alertes/${alertId}`;
  if (roles.includes("AGENT_AGRICULTURE")) return `/agent/alertes/${alertId}`;
  if (roles.includes("FARMER")) return `/agriculteur/alertes/${alertId}`;
  return null;
}

export async function getFireBrief(actor: Actor | null, fireId: string): Promise<FireBrief | null> {
  const fire = await prisma.fireDetection.findUnique({
    where: { id: fireId },
    select: {
      id: true,
      detectedAt: true,
      confidence: true,
      communeId: true,
      commune: { select: { name: true } },
    },
  });
  if (!fire) return null;

  const communes = actor ? await alertCommuneIds(actor) : "all";
  const inScope = communes === "all" || communes.includes(fire.communeId);
  if (!inScope) {
    return {
      id: fire.id,
      detectedAt: fire.detectedAt.toISOString(),
      confidence: fire.confidence,
      communeName: fire.commune.name,
      inScope: false,
      farmsWithin500m: 0,
      farmsWithin1km: 0,
      crops: [],
      notified: 0,
      alertHref: null,
    };
  }

  const nearFarms = await farmsNearFireDetection(fire.id);
  let farmIds = nearFarms.map((row) => row.farmId);
  // Un producteur ne voit que sa propre exploitation, si elle est concernée.
  if (actor) {
    const self = actor.grants.find((g) => g.role === "FARMER" && g.scopeType === "SELF");
    if (self) {
      const ownFarms = await prisma.farm.findMany({
        where: { archivedAt: null, farmer: { userId: actor.userId } },
        select: { id: true },
      });
      const ownIds = new Set(ownFarms.map((f) => f.id));
      farmIds = farmIds.filter((id) => ownIds.has(id));
    }
  }
  const near = new Set(farmIds);
  const farmsWithin500m = nearFarms.filter(
    (row) => near.has(row.farmId) && row.distanceM <= FIRE_BRIEF_NEAR_RADIUS_M,
  ).length;
  const farmsWithin1km = farmIds.length;

  const activeAlert = await prisma.alert.findFirst({
    where: {
      communeId: fire.communeId,
      category: "FIRE",
      status: "ACTIVE",
      awaitingConfirmation: false,
    },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });

  const [crops, notified] = await Promise.all([
    cropsDeclaredByFarms(farmIds),
    activeAlert ? notifiedFarmsCount(activeAlert.id, farmIds) : Promise.resolve(0),
  ]);

  return {
    id: fire.id,
    detectedAt: fire.detectedAt.toISOString(),
    confidence: fire.confidence,
    communeName: fire.commune.name,
    inScope: true,
    farmsWithin500m,
    farmsWithin1km,
    crops,
    notified,
    alertHref: activeAlert ? alertHrefFor(actor, activeAlert.id) : null,
  };
}
