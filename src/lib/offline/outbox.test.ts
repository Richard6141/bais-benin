import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDatabase } from "./db";
import { applyResults, enqueueCommand, outboxCounts, pendingCommands } from "./outbox";
import { syncBatchSchema } from "@/modules/sync/commands";
import { runSync } from "./sync-client";

const farmerId = "01923456-0000-7000-8000-000000000001";
const farmId = "01923456-0000-7000-8000-000000000002";

function farmerPayload() {
  return {
    id: farmerId,
    firstName: "Adjoua",
    lastName: "Test",
    gender: "F" as const,
    communeCode: "BJ-DON-003",
    consentAt: new Date().toISOString(),
  };
}

function farmPayload() {
  return {
    id: farmId,
    farmerId,
    communeCode: "BJ-DON-003",
    location: [1.67, 9.7] as [number, number],
    declaredAreaHa: 2.5,
    tenure: "FAMILY" as const,
    mainActivity: "CROPS" as const,
  };
}

describe("outbox hors ligne", () => {
  let db: AgentDatabase;

  beforeEach(() => {
    db = new AgentDatabase(`test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("numérote les commandes dans l'ordre de saisie", async () => {
    await enqueueCommand(db, { id: farmerId, type: "farmer.create", payload: farmerPayload() });
    await enqueueCommand(db, {
      id: farmId,
      type: "farm.create",
      payload: farmPayload(),
      dependsOn: [farmerId],
    });
    const pending = await pendingCommands(db);
    expect(pending.map((c) => c.type)).toEqual(["farmer.create", "farm.create"]);
    expect(pending.map((c) => c.sequence)).toEqual([1, 2]);
    expect(await outboxCounts(db)).toEqual({ pending: 2, failed: 0 });
  });

  it("envoie un lot avec l'identifiant d'appareil et applique les résultats", async () => {
    await enqueueCommand(db, { id: farmerId, type: "farmer.create", payload: farmerPayload() });
    await enqueueCommand(db, {
      id: farmId,
      type: "farm.create",
      payload: farmPayload(),
      dependsOn: [farmerId],
    });
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { commands: { id: string }[] };
      // Le lot envoyé doit passer le contrat serveur tel quel.
      expect(syncBatchSchema.safeParse(body).success).toBe(true);
      expect((init?.headers as Record<string, string>)["X-Device-Id"]).toBe("appareil-test");
      return new Response(
        JSON.stringify({
          receivedAt: new Date().toISOString(),
          results: body.commands.map((c, index) =>
            index === 0
              ? { id: c.id, outcome: "APPLIED", entity: { type: "farmer", id: c.id, version: 1 } }
              : {
                  id: c.id,
                  outcome: "REJECTED",
                  error: { code: "FORBIDDEN", message: "Hors périmètre" },
                },
          ),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const outcome = await runSync(db, {
      deviceId: "appareil-test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(outcome).toMatchObject({ sent: 2, applied: 1, failed: 1 });
    const farmer = await db.outbox.get(farmerId);
    const farm = await db.outbox.get(farmId);
    expect(farmer?.status).toBe("APPLIED");
    expect(farm?.status).toBe("REJECTED");
    expect(farm?.lastError?.message).toBe("Hors périmètre");
    expect(await outboxCounts(db)).toEqual({ pending: 0, failed: 1 });
  });

  it("remet le lot en attente quand le réseau échoue", async () => {
    await enqueueCommand(db, { id: farmerId, type: "farmer.create", payload: farmerPayload() });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const outcome = await runSync(db, {
      deviceId: "appareil-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(outcome.error).toContain("Failed to fetch");
    const entry = await db.outbox.get(farmerId);
    expect(entry?.status).toBe("PENDING");
    expect(entry?.attempts).toBe(1);
  });

  it("remplace le code provisoire par le code serveur une fois la création appliquée", async () => {
    await db.farms.add({
      id: farmId,
      code: "BJ-DON-003-L000001",
      farmerId,
      farmerName: "Adjoua Test",
      communeCode: "BJ-DON-003",
      communeName: "Djougou",
      verificationStatus: "DECLARED",
      declaredAreaHa: 2.5,
      parcelCount: 0,
      cropCodes: [],
      version: 0,
      syncState: "LOCAL_ONLY",
      updatedAt: new Date().toISOString(),
    });
    await enqueueCommand(db, { id: farmId, type: "farm.create", payload: farmPayload() });
    await applyResults(db, [
      {
        id: farmId,
        outcome: "APPLIED",
        entity: { type: "farm", id: farmId, code: "BJ-DON-DJO-100001", version: 1 },
      },
    ]);
    const farm = await db.farms.get(farmId);
    expect(farm).toMatchObject({ code: "BJ-DON-DJO-100001", version: 1, syncState: "SYNCED" });
  });

  it("ne renvoie pas une commande déjà appliquée", async () => {
    await enqueueCommand(db, { id: farmerId, type: "farmer.create", payload: farmerPayload() });
    await applyResults(db, [{ id: farmerId, outcome: "APPLIED" }]);
    expect(await pendingCommands(db)).toHaveLength(0);
  });
});

describe("synchronisation unique par compte", () => {
  it("ne lance qu'un envoi quand deux composants demandent la synchronisation ensemble", async () => {
    const { syncOnce } = await import("./sync-runner");
    const db = new AgentDatabase(`single-${crypto.randomUUID()}`);
    await enqueueCommand(db, { id: farmerId, type: "farmer.create", payload: farmerPayload() });
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { commands: { id: string }[] };
      return new Response(
        JSON.stringify({
          receivedAt: new Date().toISOString(),
          results: body.commands.map((c) => ({ id: c.id, outcome: "APPLIED" })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const options = { deviceId: "appareil-test", fetchImpl: fetchImpl as typeof fetch };
    const [first, second] = await Promise.all([
      syncOnce("compte-1", db, options),
      syncOnce("compte-1", db, options),
    ]);
    expect(first).toBe(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await db.delete();
  });
});
