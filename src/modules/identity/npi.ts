import { prisma } from "@/database/client";
import { getServerEnv } from "@/lib/env";
import { decryptNpi, encryptNpi, keyringFromEnv, maskNpi, npiBlindIndex } from "@/lib/crypto/npi";
import { authorize, type Actor } from "@/modules/authorization";
import { recordAudit } from "@/modules/audit";
import { getIdentityVerificationProvider } from "@/services/identity";

export type AttachNpiResult =
  | { ok: true; status: "PENDING" | "VERIFIED" | "MISMATCH"; masked: string }
  | { ok: false; reason: string };

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

// Rattache un NPI au compte : contrôle de forme, unicité par index aveugle, chiffrement,
// puis demande de vérification au fournisseur configuré. Le NPI reste facultatif :
// il rehausse la confiance d'identité, il ne conditionne pas l'accès.
export async function attachNpi(input: {
  userId: string;
  npi: string;
  lastName: string;
  firstName?: string;
  birthYear?: number;
}): Promise<AttachNpiResult> {
  const provider = getIdentityVerificationProvider();
  const format = provider.validateFormat(input.npi);
  if (!format.valid) return { ok: false, reason: format.reason ?? "NPI invalide" };

  const keyring = requireKeyring();
  // Prisma attend un Uint8Array sur ArrayBuffer, pas un Buffer.
  const index = Uint8Array.from(npiBlindIndex(input.npi, keyring));
  const duplicate = await prisma.user.findFirst({
    where: { npiIndex: index, NOT: { id: input.userId } },
    select: { id: true },
  });
  if (duplicate) return { ok: false, reason: "Ce NPI est déjà rattaché à un autre compte" };

  const outcome = await provider.verify({
    npi: input.npi,
    lastName: input.lastName,
    firstName: input.firstName,
    birthYear: input.birthYear,
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      npiIndex: index,
      npiCiphertext: encryptNpi(input.npi, contextFor(input.userId), keyring),
      npiStatus: outcome.status,
      npiVerifiedAt: outcome.status === "VERIFIED" ? outcome.verifiedAt : null,
      npiVerificationProvider: outcome.provider,
    },
  });
  await recordAudit({
    action: "user.npi.attached",
    actorId: input.userId,
    resourceType: "user",
    resourceId: input.userId,
    details: { status: outcome.status, provider: outcome.provider },
  });
  return { ok: true, status: outcome.status, masked: maskNpi(input.npi) };
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
