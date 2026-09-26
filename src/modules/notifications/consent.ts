import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";

// Accord du producteur pour recevoir des messages WhatsApp (alertes de sa commune, suivi de ses
// demandes et signalements), donné ou retiré depuis son compte. Le numéro du compte a été vérifié
// par un code WhatsApp à la connexion : c'est la preuve retenue (méthode OTP). Retirer l'accord
// arrête aussi les messages déjà en file, vérifiés au moment de l'envoi.

export interface WhatsappConsent {
  /** Faux pour un compte qu'aucune fiche producteur ne relie encore. */
  available: boolean;
  grantedAt: Date | null;
}

export type ConsentResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NO_FARMER" };

async function ownFarmer(actor: Actor) {
  return prisma.farmer.findUnique({
    where: { userId: actor.userId },
    select: { id: true },
  });
}

export async function whatsappConsentOf(actor: Actor): Promise<WhatsappConsent> {
  const farmer = await prisma.farmer.findUnique({
    where: { userId: actor.userId },
    select: {
      channelConsents: {
        where: { channel: "WHATSAPP", granted: true, revokedAt: null },
        select: { grantedAt: true, createdAt: true },
      },
    },
  });
  if (!farmer) return { available: false, grantedAt: null };
  const consent = farmer.channelConsents[0];
  return { available: true, grantedAt: consent ? (consent.grantedAt ?? consent.createdAt) : null };
}

export async function setWhatsappConsent(
  actor: Actor,
  granted: boolean,
  now = new Date(),
): Promise<ConsentResult> {
  if (!authorize(actor, "consent.manage", { ownerUserId: actor.userId }).allowed) {
    return { ok: false, code: "FORBIDDEN" };
  }
  const farmer = await ownFarmer(actor);
  if (!farmer) return { ok: false, code: "NO_FARMER" };
  await prisma.channelConsent.upsert({
    where: { farmerId_channel: { farmerId: farmer.id, channel: "WHATSAPP" } },
    create: {
      farmerId: farmer.id,
      channel: "WHATSAPP",
      granted,
      grantedAt: granted ? now : null,
      revokedAt: granted ? null : now,
      method: "OTP",
      evidence: "compte-bais-numero-verifie",
    },
    update: granted
      ? { granted: true, grantedAt: now, revokedAt: null, method: "OTP" }
      : { granted: false, revokedAt: now },
  });
  await recordAudit({
    action: granted ? "consent.whatsapp.granted" : "consent.whatsapp.revoked",
    actorId: actor.userId,
    resourceType: "farmer",
    resourceId: farmer.id,
  });
  return { ok: true };
}
