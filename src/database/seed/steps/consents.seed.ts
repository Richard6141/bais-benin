import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_FARMER_PHONE } from "./accounts.seed";

// Consentements aux canaux de notification (WhatsApp, SMS) pour les producteurs synthétiques
// qui ont un téléphone. Répartition indicative, déterministe par producteur (hachage de son
// identifiant) : 55 % acceptent WhatsApp et SMS, 20 % le SMS seul, 25 % aucun message (ils
// seront prévenus par l'agent). L'agricultrice de démonstration accepte les deux canaux.
// Idempotent : contrainte unique (producteur, canal), doublons ignorés ; le consentement de la
// démo est remis à « accordé » à chaque passage.

const SOURCE_EVIDENCE = "seed-consentement-enrolement";

function bucket(farmerId: string): number {
  return createHash("sha256").update(farmerId).digest()[0]! % 100;
}

export function consentChannelsFor(farmerId: string): Array<"WHATSAPP" | "SMS"> {
  const value = bucket(farmerId);
  if (value < 55) return ["WHATSAPP", "SMS"];
  if (value < 75) return ["SMS"];
  return [];
}

export async function seedChannelConsents(prisma: PrismaClient): Promise<number> {
  const farmers = await prisma.farmer.findMany({
    where: { archivedAt: null, sourceId: "BAIS_SEED", phoneE164: { not: null } },
    select: { id: true, createdAt: true },
  });
  const rows = farmers.flatMap((farmer) =>
    consentChannelsFor(farmer.id).map((channel) => ({
      farmerId: farmer.id,
      channel,
      granted: true,
      grantedAt: farmer.createdAt,
      method: "AGENT_FORM" as const,
      evidence: SOURCE_EVIDENCE,
    })),
  );
  let created = 0;
  for (let index = 0; index < rows.length; index += 1000) {
    const result = await prisma.channelConsent.createMany({
      data: rows.slice(index, index + 1000),
      skipDuplicates: true,
    });
    created += result.count;
  }

  const demo = await prisma.farmer.findFirst({
    where: { user: { phoneNumber: DEMO_FARMER_PHONE } },
    select: { id: true },
  });
  if (demo) {
    for (const channel of ["WHATSAPP", "SMS"] as const) {
      await prisma.channelConsent.upsert({
        where: { farmerId_channel: { farmerId: demo.id, channel } },
        create: {
          farmerId: demo.id,
          channel,
          granted: true,
          grantedAt: new Date(),
          method: "OTP",
          evidence: "seed-compte-demonstration",
        },
        update: { granted: true, revokedAt: null },
      });
    }
  }
  return created;
}
