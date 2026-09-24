import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/authorization";
import type { SyncCommandType } from "../commands";
import type { HandlerOutcome, SyncHandler, SyncHandlers } from "../handlers/types";

// Aucune base ici : le client Prisma est remplacé par un journal de commandes en mémoire et
// les handlers par des doubles qui renvoient un résultat choisi par le test.

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/modules/audit", () => audit);
vi.mock("@/database/client", () => ({ prisma: {} }));
vi.mock("../handlers", () => ({ syncHandlers: {} }));

const { createSyncApplier } = await import("../apply");

interface StoredCommand {
  id: string;
  idempotencyKey: string;
  outcome: string;
  result: unknown;
}

function fakeDb() {
  const store = new Map<string, StoredCommand>();
  const farmEvents: unknown[] = [];
  const tx = {
    farmEvent: { create: vi.fn(async ({ data }: { data: unknown }) => farmEvents.push(data)) },
    syncCommand: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { idempotencyKey: string };
          create: StoredCommand;
          update: Partial<StoredCommand>;
        }) => {
          const existing = store.get(where.idempotencyKey);
          store.set(where.idempotencyKey, existing ? { ...existing, ...update } : create);
        },
      ),
    },
  };
  const db = {
    syncCommand: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
        const found = store.get(where.idempotencyKey);
        return found ? { outcome: found.outcome, result: found.result } : null;
      }),
      upsert: tx.syncCommand.upsert,
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { db, store, farmEvents };
}

function handlerReturning(
  outcome: HandlerOutcome,
  target: ReturnType<SyncHandler<SyncCommandType>["target"]> extends Promise<infer T>
    ? T
    : never = {
    action: "farm.create",
    resource: { communeId: "commune-1" },
  },
) {
  return {
    target: vi.fn(async () => target),
    apply: vi.fn(async () => outcome),
  };
}

const AGENT: Actor = {
  userId: "user-agent",
  grants: [{ role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: "commune-1" }],
};

const BASE = {
  clientCreatedAt: "2026-09-24T10:00:00+01:00",
  deviceId: "device-abcd",
};

function farmerCommand(id: string, key = `key-${id}`) {
  return {
    ...BASE,
    id,
    type: "farmer.create",
    idempotencyKey: key,
    payload: {
      id,
      firstName: "Adjoua",
      lastName: "Test",
      communeCode: "BJ-DON-003",
      consentAt: BASE.clientCreatedAt,
    },
  };
}

function farmCommand(id: string, farmerId: string, dependsOn: string[]) {
  return {
    ...BASE,
    id,
    type: "farm.create",
    idempotencyKey: `key-${id}`,
    dependsOn,
    payload: {
      id,
      farmerId,
      communeCode: "BJ-DON-003",
      location: [1.67, 9.7],
      declaredAreaHa: 1.5,
    },
  };
}

const FARMER_ID = "018f4b2e-1c2d-7a3b-8c4d-000000000001";
const FARM_ID = "018f4b2e-1c2d-7a3b-8c4d-000000000002";

describe("applySyncBatch", () => {
  beforeEach(() => {
    audit.recordAudit.mockClear();
  });

  it("rejette une commande illisible sans appeler de handler", async () => {
    const { db } = fakeDb();
    const handlers = {
      "farmer.create": handlerReturning({
        outcome: "REJECTED",
        error: { code: "X", message: "x" },
      }),
    } as unknown as SyncHandlers;
    const apply = createSyncApplier({ db: db as never, handlers });
    const results = await apply(AGENT, "device-abcd", [
      { id: FARMER_ID, type: "farmer.create", payload: {} },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: FARMER_ID,
      outcome: "REJECTED",
      error: { code: "INVALID_ENVELOPE" },
    });
    expect(
      (handlers["farmer.create"] as unknown as { apply: ReturnType<typeof vi.fn> }).apply,
    ).not.toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sync.batch.received" }),
    );
  });

  it("applique, journalise le fil d'activité et renvoie DUPLICATE au rejeu", async () => {
    const { db, store, farmEvents } = fakeDb();
    const applied: HandlerOutcome = {
      outcome: "APPLIED",
      entity: { type: "farm", id: FARM_ID, code: "BJ-DON-DJO-100001", version: 1 },
      farmId: FARM_ID,
      eventKind: "CREATED",
      audit: { action: "registry.farm.created" },
    };
    const handlers = {
      "farmer.create": handlerReturning({
        outcome: "APPLIED",
        entity: { type: "farmer", id: FARMER_ID, code: "BJ-F-010000001", version: 1 },
        audit: { action: "registry.farmer.created" },
      }),
      "farm.create": handlerReturning(applied),
    } as unknown as SyncHandlers;
    const apply = createSyncApplier({
      db: db as never,
      handlers,
      now: () => new Date("2026-09-24T11:00:00Z"),
    });
    const batch = [farmerCommand(FARMER_ID), farmCommand(FARM_ID, FARMER_ID, [FARMER_ID])];

    const first = await apply(AGENT, "device-abcd", batch);
    expect(first.map((r) => r.outcome)).toEqual(["APPLIED", "APPLIED"]);
    expect(first[1]?.entity).toEqual(applied.entity);
    expect(store.size).toBe(2);
    expect(farmEvents).toHaveLength(1);
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "registry.farm.created", resourceId: FARM_ID }),
    );

    const replay = await apply(AGENT, "device-abcd", batch);
    expect(replay.map((r) => r.outcome)).toEqual(["DUPLICATE", "DUPLICATE"]);
    expect(replay[1]?.entity).toEqual(applied.entity);
    // Le rejeu ne repasse ni par les handlers ni par le fil d'activité.
    expect(
      (handlers["farm.create"] as unknown as { apply: ReturnType<typeof vi.fn> }).apply,
    ).toHaveBeenCalledTimes(1);
    expect(farmEvents).toHaveLength(1);
  });

  it("refuse une commande dont une dépendance du lot a échoué (DEPENDENCY_FAILED)", async () => {
    const { db } = fakeDb();
    const handlers = {
      "farmer.create": handlerReturning({
        outcome: "REJECTED",
        error: { code: "NOT_FOUND", message: "Commune inconnue" },
      }),
      "farm.create": handlerReturning({
        outcome: "APPLIED",
        entity: { type: "farm", id: FARM_ID, version: 1 },
        audit: { action: "registry.farm.created" },
      }),
    } as unknown as SyncHandlers;
    const apply = createSyncApplier({ db: db as never, handlers });
    const results = await apply(AGENT, "device-abcd", [
      farmerCommand(FARMER_ID),
      farmCommand(FARM_ID, FARMER_ID, [FARMER_ID]),
    ]);
    expect(results[0]).toMatchObject({ outcome: "REJECTED", error: { code: "NOT_FOUND" } });
    expect(results[1]).toMatchObject({ outcome: "REJECTED", error: { code: "DEPENDENCY_FAILED" } });
    expect(
      (handlers["farm.create"] as unknown as { apply: ReturnType<typeof vi.fn> }).apply,
    ).not.toHaveBeenCalled();
  });

  it("retente une clé dont la tentative précédente avait échoué", async () => {
    const { db, store } = fakeDb();
    const rejecting = handlerReturning({
      outcome: "REJECTED",
      error: { code: "NOT_FOUND", message: "Commune inconnue" },
    });
    const apply = createSyncApplier({
      db: db as never,
      handlers: { "farmer.create": rejecting } as unknown as SyncHandlers,
    });
    await apply(AGENT, "device-abcd", [farmerCommand(FARMER_ID)]);
    expect(store.get(`key-${FARMER_ID}`)?.outcome).toBe("REJECTED");

    rejecting.apply.mockResolvedValueOnce({
      outcome: "APPLIED",
      entity: { type: "farmer", id: FARMER_ID, version: 1 },
      audit: { action: "registry.farmer.created" },
    });
    const retry = await apply(AGENT, "device-abcd", [farmerCommand(FARMER_ID)]);
    expect(retry[0]?.outcome).toBe("APPLIED");
    expect(store.get(`key-${FARMER_ID}`)?.outcome).toBe("APPLIED");
  });

  it("refuse une commande hors périmètre (FORBIDDEN) et une cible inexistante (NOT_FOUND)", async () => {
    const { db } = fakeDb();
    const outOfScope = handlerReturning(
      {
        outcome: "APPLIED",
        entity: { type: "farmer", id: FARMER_ID, version: 1 },
        audit: { action: "registry.farmer.created" },
      },
      { action: "farm.create", resource: { communeId: "commune-autre" } },
    );
    const missing = handlerReturning(
      {
        outcome: "APPLIED",
        entity: { type: "farmer", id: FARMER_ID, version: 1 },
        audit: { action: "registry.farmer.created" },
      },
      null,
    );
    const applyOut = createSyncApplier({
      db: db as never,
      handlers: { "farmer.create": outOfScope } as unknown as SyncHandlers,
    });
    const [forbidden] = await applyOut(AGENT, "device-abcd", [farmerCommand(FARMER_ID)]);
    expect(forbidden).toMatchObject({ outcome: "REJECTED", error: { code: "FORBIDDEN" } });
    expect(outOfScope.apply).not.toHaveBeenCalled();

    const applyMissing = createSyncApplier({
      db: db as never,
      handlers: { "farmer.create": missing } as unknown as SyncHandlers,
    });
    const [notFound] = await applyMissing(AGENT, "device-abcd", [
      farmerCommand(FARMER_ID, "key-autre-00001"),
    ]);
    expect(notFound).toMatchObject({ outcome: "REJECTED", error: { code: "NOT_FOUND" } });
  });

  it("convertit une exception du handler en REJECTED INTERNAL_ERROR sans interrompre le lot", async () => {
    const { db } = fakeDb();
    const failing = handlerReturning({ outcome: "REJECTED", error: { code: "X", message: "x" } });
    failing.apply.mockRejectedValueOnce(new Error("panne"));
    const apply = createSyncApplier({
      db: db as never,
      handlers: { "farmer.create": failing } as unknown as SyncHandlers,
    });
    const results = await apply(AGENT, "device-abcd", [
      farmerCommand(FARMER_ID),
      farmerCommand("018f4b2e-1c2d-7a3b-8c4d-000000000009"),
    ]);
    expect(results[0]).toMatchObject({ outcome: "REJECTED", error: { code: "INTERNAL_ERROR" } });
    expect(results[1]).toMatchObject({ outcome: "REJECTED", error: { code: "X" } });
  });
});
