import { createHash } from "node:crypto";
import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

// Journal d'audit en ajout seul (docs/06 §6). L'adresse IP est hachée : on veut
// corréler des tentatives, pas conserver une donnée personnelle en clair.

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
  | "registry.farmer.created"
  | "registry.farm.created"
  | "registry.parcel.created"
  | "registry.crop.declared"
  | "registry.harvest.declared"
  | "registry.farm.verified"
  | "sync.batch.received";

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
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
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
