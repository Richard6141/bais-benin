import { prisma } from "@/database/client";
import { getServerEnv } from "@/lib/env";
import {
  decryptNpi,
  encryptNpi,
  keyringFromEnv,
  maskNpi,
  npiBlindIndex,
  sameBlindIndex,
} from "@/lib/crypto/npi";
import { authorize, type Actor } from "@/modules/authorization";
import { recordAudit } from "@/modules/audit";
import { getIdentityVerificationProvider } from "@/services/identity";

function contextFor(userId: string) {
  return { table: "user", column: "npi_ciphertext", recordId: userId };
}

function requireKeyring() {
  const keyring = keyringFromEnv(getServerEnv());
  if (!keyring) {
    throw new Error("NPI_ENCRYPTION_KEY et NPI_HASH_KEY sont nécessaires pour enregistrer un NPI");
  }
  return keyring;
}

/** Contrôle de forme du NPI par le fournisseur configuré (longueur, chiffres). */
export function validateNpiFormat(npi: string): { valid: boolean; reason?: string } {
  return getIdentityVerificationProvider().validateFormat(npi);
}

export type NpiBinding = { ok: true; attached: boolean } | { ok: false; reason: "MISMATCH" };

/** Le NPI est-il déjà rattaché à un compte (autre que `exceptUserId`) ? */
export async function isNpiTaken(npi: string, exceptUserId?: string): Promise<boolean> {
  const index = Uint8Array.from(npiBlindIndex(npi, requireKeyring()));
  const holder = await prisma.user.findFirst({
    where: { npiIndex: index, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) },
    select: { id: true },
  });
  return holder !== null;
}

// Connexion par NPI et code (ADR-0012) : appelé une fois le code vérifié, donc la possession du
// numéro prouvée. Un compte déjà lié doit présenter le même NPI ; un compte sans NPI reçoit
// celui-ci, s'il n'appartient à personne d'autre, en attente de vérification par l'ANIP. Sert
// aussi à l'ouverture d'un compte par l'administration (provisioning.ts, ADR-0013).
export async function bindNpiOnSignIn(
  userId: string,
  npi: string,
  via: "sign-in" | "admin" = "sign-in",
): Promise<NpiBinding> {
  const provider = getIdentityVerificationProvider();
  if (!provider.validateFormat(npi).valid) return { ok: false, reason: "MISMATCH" };
  const keyring = requireKeyring();
  const index = npiBlindIndex(npi, keyring);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { npiIndex: true },
  });
  if (user.npiIndex) {
    return sameBlindIndex(Buffer.from(user.npiIndex), index)
      ? { ok: true, attached: false }
      : { ok: false, reason: "MISMATCH" };
  }
  if (await isNpiTaken(npi, userId)) return { ok: false, reason: "MISMATCH" };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        npiIndex: Uint8Array.from(index),
        npiCiphertext: encryptNpi(npi, contextFor(userId), keyring),
        npiStatus: "PENDING",
        npiVerifiedAt: null,
        npiVerificationProvider: provider.id,
      },
    });
  } catch (error) {
    // Deux connexions simultanées avec le même NPI : l'index unique départage.
    if ((error as { code?: string }).code === "P2002") return { ok: false, reason: "MISMATCH" };
    throw error;
  }
  await recordAudit({
    action: "user.npi.attached",
    actorId: userId,
    resourceType: "user",
    resourceId: userId,
    details: { status: "PENDING", provider: provider.id, via },
  });
  return { ok: true, attached: true };
}

export async function npiSummary(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      npiStatus: true,
      npiCiphertext: true,
      npiVerifiedAt: true,
      npiVerificationProvider: true,
    },
  });
  if (!user.npiCiphertext)
    return { status: "NONE" as const, masked: null, verifiedAt: null, provider: null };
  const keyring = keyringFromEnv(getServerEnv());
  const masked = keyring
    ? maskNpi(decryptNpi(user.npiCiphertext, contextFor(userId), keyring))
    : "•••• ••••";
  return {
    status: user.npiStatus,
    masked,
    verifiedAt: user.npiVerifiedAt,
    provider: user.npiVerificationProvider,
  };
}

// Révélation en clair : réservée à un rôle habilité, avec justification, toujours journalisée.
export async function revealNpi(actor: Actor, targetUserId: string, justification: string) {
  const decision = authorize(actor, "user.npi.reveal", { ownerUserId: targetUserId });
  if (!decision.allowed) {
    await recordAudit({
      action: "user.npi.revealed",
      actorId: actor.userId,
      resourceType: "user",
      resourceId: targetUserId,
      outcome: "DENIED",
    });
    throw new Error(decision.reason);
  }
  if (justification.trim().length < 10) {
    throw new Error("Une justification d'au moins 10 caractères est requise");
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { npiCiphertext: true },
  });
  if (!user.npiCiphertext) return null;
  const npi = decryptNpi(user.npiCiphertext, contextFor(targetUserId), requireKeyring());
  await recordAudit({
    action: "user.npi.revealed",
    actorId: actor.userId,
    resourceType: "user",
    resourceId: targetUserId,
    details: { justification },
  });
  return npi;
}
