import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";

// Accord du producteur pour figurer dans les palmarès publiés par le ministère (complément
// d'ADR-0018), donné ou retiré par lui-même depuis son compte. Sans cet accord, il n'apparaît
// jamais dans un palmarès public. Le retirer l'efface tout de suite des palmarès déjà publiés.

export interface RankingConsentState {
  /** Faux pour un compte qu'aucune fiche producteur ne relie encore. */
  available: boolean;
  grantedAt: Date | null;
}

export type RankingConsentResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NO_FARMER" };

export async function rankingConsentOf(actor: Actor): Promise<RankingConsentState> {
  const farmer = await prisma.farmer.findUnique({
    where: { userId: actor.userId },
    select: { rankingConsent: { select: { grantedAt: true, revokedAt: true } } },
  });
  if (!farmer) return { available: false, grantedAt: null };
  const consent = farmer.rankingConsent;
  return { available: true, grantedAt: consent && !consent.revokedAt ? consent.grantedAt : null };
}

export async function setRankingConsent(
  actor: Actor,
  granted: boolean,
  now = new Date(),
): Promise<RankingConsentResult> {
  if (!authorize(actor, "consent.manage", { ownerUserId: actor.userId }).allowed) {
    return { ok: false, code: "FORBIDDEN" };
  }
  const farmer = await prisma.farmer.findUnique({
    where: { userId: actor.userId },
    select: { id: true },
  });
  if (!farmer) return { ok: false, code: "NO_FARMER" };

  const removed = await prisma.$transaction(async (tx) => {
    if (granted) {
      await tx.rankingConsent.upsert({
        where: { farmerId: farmer.id },
        create: { farmerId: farmer.id, grantedAt: now },
        update: { grantedAt: now, revokedAt: null },
      });
      return 0;
    }
    await tx.rankingConsent.updateMany({
      where: { farmerId: farmer.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const deleted = await tx.publishedRankingEntry.deleteMany({ where: { farmerId: farmer.id } });
    return deleted.count;
  });
  await recordAudit({
    action: granted ? "consent.ranking.granted" : "consent.ranking.revoked",
    actorId: actor.userId,
    resourceType: "farmer",
    resourceId: farmer.id,
    ...(granted ? {} : { details: { removedFromPublishedRankings: removed } }),
  });
  return { ok: true };
}
