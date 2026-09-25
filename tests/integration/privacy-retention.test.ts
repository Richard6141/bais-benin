import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { purgeAuditLogDetails, purgeSyncCommandPayloads } from "@/modules/privacy";

// C4 : purge/anonymisation périodique des données personnelles (APDP). Les lignes créées ici
// sont retirées en fin de suite, purgées ou non.

const created = { syncCommands: [] as string[], auditLogs: [] as string[] };

describe("purge des données personnelles (rétention)", () => {
  afterAll(async () => {
    await prisma.syncCommand.deleteMany({ where: { id: { in: created.syncCommands } } });
    await prisma.auditLog.deleteMany({ where: { id: { in: created.auditLogs } } });
    await prisma.$disconnect();
  });

  it("efface la charge utile d'une commande appliquée passé le délai, jamais avant", async () => {
    const now = new Date("2026-09-25T00:00:00Z");
    const old = await prisma.syncCommand.create({
      data: {
        id: crypto.randomUUID(),
        idempotencyKey: `retention-old-${crypto.randomUUID()}`,
        deviceId: "test",
        userId: (await prisma.user.findFirstOrThrow({ select: { id: true } })).id,
        commandType: "farm.create",
        payload: { firstName: "Ancienne", lastName: "Donnée" },
        clientCreatedAt: new Date(now.getTime() - 200 * 86_400_000),
        outcome: "APPLIED",
      },
    });
    const recent = await prisma.syncCommand.create({
      data: {
        id: crypto.randomUUID(),
        idempotencyKey: `retention-recent-${crypto.randomUUID()}`,
        deviceId: "test",
        userId: old.userId,
        commandType: "farm.create",
        payload: { firstName: "Récente", lastName: "Donnée" },
        clientCreatedAt: new Date(now.getTime() - 10 * 86_400_000),
        outcome: "APPLIED",
      },
    });
    created.syncCommands.push(old.id, recent.id);

    const purged = await purgeSyncCommandPayloads(now);
    expect(purged).toBeGreaterThanOrEqual(1);

    const oldAfter = await prisma.syncCommand.findUniqueOrThrow({ where: { id: old.id } });
    expect(oldAfter.payload).toMatchObject({ redacted: true });

    const recentAfter = await prisma.syncCommand.findUniqueOrThrow({ where: { id: recent.id } });
    expect(recentAfter.payload).toMatchObject({ firstName: "Récente" });

    // Idempotent : une seconde purge ne recompte pas la même ligne.
    expect(await purgeSyncCommandPayloads(now)).toBe(0);
  });

  it("vide le détail d'une entrée d'audit ancienne sans toucher aux champs de traçabilité", async () => {
    const now = new Date("2026-09-25T00:00:00Z");
    const old = await prisma.auditLog.create({
      data: {
        action: "auth.sign_in",
        occurredAt: new Date(now.getTime() - 400 * 86_400_000),
        details: { userAgent: "test", note: "ancienne entrée" },
      },
    });
    const recent = await prisma.auditLog.create({
      data: {
        action: "auth.sign_in",
        occurredAt: new Date(now.getTime() - 5 * 86_400_000),
        details: { note: "récente entrée" },
      },
    });
    created.auditLogs.push(old.id, recent.id);

    const purged = await purgeAuditLogDetails(now);
    expect(purged).toBeGreaterThanOrEqual(1);

    const oldAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: old.id } });
    expect(oldAfter.details).toBeNull();
    expect(oldAfter.action).toBe("auth.sign_in");

    const recentAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: recent.id } });
    expect(recentAfter.details).toMatchObject({ note: "récente entrée" });
  });
});
