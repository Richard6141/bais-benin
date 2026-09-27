import { prisma } from "@/database/client";
import { earliestFireDetection, fireDetectionsByCommune } from "@/database/sql/fire-clusters.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { queueFarmerNotifications } from "@/modules/notifications/queue";
import {
  FIRE_PREVENTION_TEXT,
  fireSeasons,
  isFireSeason,
  mostAffectedCommunes,
  preventionSubjectId,
  weekKey,
} from "./prevention-rules";

// Conseil hebdomadaire de la saison des feux (ADR-0038 §3) : le lundi, de novembre à avril, un
// message WhatsApp aux producteurs des communes les plus touchées par les feux la saison passée
// (ou, tant qu'elle n'est pas en base, depuis le début de la saison en cours), qui ont donné leur
// accord. Passe par la file des messages aux producteurs : accord revérifié à l'envoi, silence de
// 21 h à 6 h, trois essais au plus. Désactivé par défaut (FIRE_PREVENTION_MESSAGES).

/** La saison passée compte si la base remonte à sa première semaine. */
const PREVIOUS_SEASON_GRACE_MS = 7 * 86_400_000;

export type FirePreventionResult =
  | { status: "disabled" | "off-season" }
  | {
      status: "queued";
      week: string;
      reference: "previous-season" | "current-season";
      communes: number;
      queued: number;
    };

export async function queueFirePrevention(
  options: { now?: Date; enabled?: boolean } = {},
): Promise<FirePreventionResult> {
  const now = options.now ?? new Date();
  const enabled = options.enabled ?? getServerEnv().FIRE_PREVENTION_MESSAGES === "1";
  if (!enabled) return { status: "disabled" };
  if (!isFireSeason(now)) return { status: "off-season" };

  const seasons = fireSeasons(now);
  const earliest = await earliestFireDetection();
  const reference =
    earliest && earliest.getTime() <= seasons.previous.from.getTime() + PREVIOUS_SEASON_GRACE_MS
      ? "previous-season"
      : "current-season";
  const window = reference === "previous-season" ? seasons.previous : seasons.current;
  const communeIds = mostAffectedCommunes(await fireDetectionsByCommune(window.from, window.to));
  const week = weekKey(now);
  if (communeIds.length === 0) {
    return { status: "queued", week, reference, communes: 0, queued: 0 };
  }

  // Producteurs d'une exploitation active de ces communes, avec un numéro et l'accord WhatsApp.
  const farmers = await prisma.farmer.findMany({
    where: {
      archivedAt: null,
      phoneE164: { not: null },
      farms: { some: { communeId: { in: communeIds }, archivedAt: null } },
      channelConsents: { some: { channel: "WHATSAPP", granted: true, revokedAt: null } },
    },
    select: { id: true },
  });
  const created = await queueFarmerNotifications(
    prisma,
    farmers.map((farmer) => ({
      farmerId: farmer.id,
      kind: "FIRE_PREVENTION" as const,
      subjectId: preventionSubjectId(farmer.id, week),
      text: FIRE_PREVENTION_TEXT,
    })),
    now,
  );
  logger.info(
    { week, reference, communes: communeIds.length, queued: created.length },
    "Conseils de la saison des feux mis en file",
  );
  return { status: "queued", week, reference, communes: communeIds.length, queued: created.length };
}
