import { prisma } from "@/database/client";
import { fireDetectionsByCommune, monthsWithFires } from "@/database/sql/fire-clusters.sql";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { queueFarmerNotifications } from "@/modules/notifications/queue";
import { archiveSeasonWindow, lastCompleteSeason } from "./archive-sources";
import {
  FIRE_PREVENTION_TEXT,
  SEASON_MONTHS,
  fireSeasons,
  isFireSeason,
  rankAffectedCommunes,
  preventionSubjectId,
  seasonLabel,
  weekKey,
  type AffectedCommune,
} from "./prevention-rules";

// Conseil hebdomadaire de la saison des feux (ADR-0038 §3, ADR-0039) : le lundi, de novembre à
// avril, un message WhatsApp aux producteurs des communes les plus touchées par les feux, qui ont
// donné leur accord. Référence : la saison sèche passée si elle est en base ; sinon la dernière
// saison sèche complète en base (par exemple 2023-2024, chargeable sans clé) ; sinon la saison en
// cours depuis le 1er novembre. Passe par la file des messages aux producteurs : accord revérifié
// à l'envoi, silence de 21 h à 6 h, trois essais au plus, fiches de démonstration écartées.
// Désactivé par défaut (FIRE_PREVENTION_MESSAGES).

/** Saisons remontées à la recherche d'une saison complète : ce que garde la base (trois ans). */
const SEASONS_BACK = 3;

export interface PreventionReference {
  /** Saison passée, dernière saison complète plus ancienne, ou saison en cours faute de mieux. */
  kind: "previous-season" | "latest-complete-season" | "current-season";
  startYear: number;
  /** « saison 2023-2024 », ou « saison 2026-2027 en cours ». */
  label: string;
  /** Saison passée quand elle manque et qu'une autre la remplace ; null sinon. */
  missingLabel: string | null;
  from: Date;
  to: Date;
}

/** Saison de référence de la prévention à cette date (voir l'en-tête). */
export async function preventionReference(now: Date): Promise<PreventionReference> {
  const previous = lastCompleteSeason(now);
  for (let year = previous; year > previous - SEASONS_BACK; year -= 1) {
    const window = archiveSeasonWindow(year);
    if ((await monthsWithFires(window.from, window.to)) >= SEASON_MONTHS) {
      return {
        kind: year === previous ? "previous-season" : "latest-complete-season",
        startYear: year,
        label: seasonLabel(year),
        missingLabel: year === previous ? null : seasonLabel(previous),
        ...window,
      };
    }
  }
  // Faute de saison complète : la saison en cours depuis le 1er novembre (hors saison, la dernière
  // saison sèche, telle que la base la connaît).
  const current = fireSeasons(now).current;
  const startYear = new Date(current.from.getTime() + 3_600_000).getUTCFullYear();
  return {
    kind: "current-season",
    startYear,
    label: isFireSeason(now)
      ? `${seasonLabel(startYear)} en cours`
      : `${seasonLabel(startYear)}, incomplète en base`,
    missingLabel: startYear === previous ? null : seasonLabel(previous),
    from: current.from,
    to: current.to,
  };
}

export type FirePreventionResult =
  | { status: "disabled" | "off-season" }
  | {
      status: "queued";
      week: string;
      reference: PreventionReference["kind"];
      referenceLabel: string;
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

  const reference = await preventionReference(now);
  const communeIds = rankAffectedCommunes(
    await fireDetectionsByCommune(reference.from, reference.to),
  ).map((commune) => commune.id);
  const week = weekKey(now);
  const summary = {
    status: "queued" as const,
    week,
    reference: reference.kind,
    referenceLabel: reference.label,
    communes: communeIds.length,
  };
  if (communeIds.length === 0) return { ...summary, queued: 0 };

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
    { week, reference: reference.label, communes: communeIds.length, queued: created.length },
    "Conseils de la saison des feux mis en file",
  );
  return { ...summary, queued: created.length };
}

export interface FirePreventionStatus {
  /** Interrupteur FIRE_PREVENTION_MESSAGES. */
  enabled: boolean;
  inSeason: boolean;
  reference: PreventionReference;
  /** Communes qui recevraient le conseil, de la plus touchée à la moins touchée. */
  communes: AffectedCommune[];
}

/** État de la prévention pour le centre de veille du ministère (lecture seule). */
export async function getFirePreventionStatus(
  now: Date = new Date(),
): Promise<FirePreventionStatus> {
  const reference = await preventionReference(now);
  return {
    enabled: getServerEnv().FIRE_PREVENTION_MESSAGES === "1",
    inSeason: isFireSeason(now),
    reference,
    communes: rankAffectedCommunes(await fireDetectionsByCommune(reference.from, reference.to)),
  };
}
