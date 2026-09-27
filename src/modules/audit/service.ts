import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

// Journal d'audit en ajout seul (docs/06 §6). L'adresse IP est hachée : on veut
// corréler des tentatives, pas conserver une donnée personnelle en clair.

// C4 : HMAC à clé plutôt qu'un sha256 nu — une IPv4 tient sur 32 bits (moins de 4,3 milliards
// de valeurs), un hachage non salé se reconstruit entièrement par table précalculée ; sans la
// clé, un hachage seul ne permet plus de retrouver l'adresse d'origine. AUDIT_IP_HASH_KEY est
// obligatoire en production (lib/env.ts) ; en développement, une clé éphémère est générée pour
// ce process si elle manque (les hachages ne sont alors plus comparables d'un redémarrage à
// l'autre, sans conséquence hors production).
let devHashKey: Buffer | undefined;
function ipHashKey(): Buffer {
  const configured = getServerEnv().AUDIT_IP_HASH_KEY;
  if (configured) return Buffer.from(configured, "base64");
  devHashKey ??= (() => {
    logger.warn(
      "AUDIT_IP_HASH_KEY absent : clé de hachage éphémère générée pour ce process de développement",
    );
    return randomBytes(32);
  })();
  return devHashKey;
}

export type AuditAction =
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.sign_out"
  | "auth.otp_requested"
  | "auth.two_factor_enabled"
  | "auth.two_factor_disabled"
  | "auth.session_revoked"
  | "user.role.granted"
  | "user.role.revoked"
  | "user.npi.attached"
  | "user.npi.revealed"
  | "user.npi.verification_requested"
  | "user.farmer.linked"
  | "registry.farmer.created"
  | "registry.farm.created"
  | "registry.parcel.created"
  | "registry.crop.declared"
  | "registry.harvest.declared"
  | "registry.farm.verified"
  | "registry.parcel.inspected"
  | "registry.attestation.issued"
  | "registry.attestation.revoked"
  | "sync.batch.received"
  | "alert.raised"
  | "alert.released"
  | "alert.acknowledged"
  | "alert.relayed"
  | "alert.resolved"
  | "report.created"
  | "report.reviewed"
  | "assistance.requested"
  | "survey.point.observed"
  | "stats.official.imported"
  | "feedback.created"
  | "feedback.status.changed"
  | "feedback.exported"
  | "burn.requested"
  | "damage.declaration.reviewed"
  | "damage.exported"
  | "assistance.taken"
  | "assistance.resolved"
  | "rule.created"
  | "rule.updated"
  | "rule.toggled"
  | "rule.simulated"
  | "monitoring.ingest.completed"
  | "monitoring.ingest.fallback"
  | "assistant.journal.read"
  | "analytics.export"
  | "analytics.ranking.read"
  | "analytics.ranking.export"
  | "analytics.ranking.published"
  | "analytics.ranking.withdrawn"
  | "group.created"
  | "group.read"
  | "group.exported"
  | "group.messaged"
  | "group.archived"
  | "consent.whatsapp.granted"
  | "consent.whatsapp.revoked"
  | "consent.ranking.granted"
  | "consent.ranking.revoked";

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  resourceType?: string;
  resourceId?: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  details?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export function hashIp(ip: string): string {
  return createHmac("sha256", ipHashKey()).update(ip).digest("hex").slice(0, 32);
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome ?? "SUCCESS",
        details: entry.details,
        ipHash: entry.ip ? hashIp(entry.ip) : null,
        userAgent: entry.userAgent?.slice(0, 255) ?? null,
        correlationId: entry.correlationId ?? null,
      },
    });
  } catch (error) {
    // Un échec d'audit ne doit jamais casser l'action métier, mais il doit se voir.
    logger.error({ err: error, action: entry.action }, "Écriture du journal d'audit impossible");
  }
}

export async function listAudit(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, name: true } } },
  });
}
