import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { AgentDatabase } from "@/lib/offline/db";
import { parseSyncCommand } from "@/modules/sync/commands";
import { createEnrolmentDraft, saveEnrolmentSection } from "./enrolment-draft";
import { EnrolmentIncompleteError, buildCommands, submitEnrolment } from "./enrolment-submit";
import type { EnrolmentData } from "./enrolment-types";

const complete: EnrolmentData = {
  farmer: {
    mode: "NEW",
    firstName: "Adjoa",
    lastName: "Hounkpatin",
    gender: "F",
    phone: "0190000002",
    birthYear: 1984,
  },
  location: {
    position: { lng: 1.667, lat: 9.708, accuracyM: 12 },
    communeCode: "BJ-DON-003",
    communeName: "Djougou",
    communeSource: "GPS",
    outsidePerimeter: false,
  },
  size: { areaHa: "2,5", tenure: "FAMILY", irrigation: "NONE" },
  parcels: [
    {
      id: "01923456-0000-7000-8000-00000000a001",
      name: "Champ du bas",
      areaHa: 1.5,
      cropCodes: ["MAIZE", "COWPEA"],
    },
    {
      id: "01923456-0000-7000-8000-00000000a002",
      name: "Parcelle 2",
      areaHa: 1,
      cropCodes: ["CASHEW"],
    },
  ],
  crops: { cropCodes: [], seasonCode: "MAIN_RAINY" },
  consentAt: "2026-09-24T10:00:00.000Z",
  result: null,
};

const context = {
  campaignCode: "2025-2026",
  cropCycles: { MAIZE: "ANNUAL", COWPEA: "ANNUAL", CASHEW: "PERENNIAL" },
};

let counter = 0;
const newId = () => `01923456-0000-7000-8000-0000000000${String(++counter).padStart(2, "0")}`;

describe("buildCommands", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("produit les commandes dans l'ordre avec leurs dépendances", () => {
    const { commands, farmId, farmerId } = buildCommands(complete, { ...context, newId });
    expect(commands.map((command) => command.type)).toEqual([
      "farmer.create",
      "farm.create",
      "parcel.create",
      "cropSeason.declare",
      "cropSeason.declare",
      "parcel.create",
      "cropSeason.declare",
    ]);
    expect(commands[1]?.dependsOn).toEqual([farmerId]);
    expect(commands[2]?.dependsOn).toEqual([farmId]);
    expect(commands[3]?.dependsOn).toEqual(["01923456-0000-7000-8000-00000000a001"]);
  });

  it("respecte les schémas serveur de chaque charge utile", () => {
    const { commands } = buildCommands(complete, { ...context, newId });
    for (const command of commands) {
      const parsed = parseSyncCommand({
        ...command,
        idempotencyKey: command.id,
        clientCreatedAt: "2026-09-24T10:00:00.000Z",
        deviceId: "test-device",
      });
      expect(parsed.ok, `${command.type}: ${JSON.stringify(parsed)}`).toBe(true);
    }
    const farmer = commands[0]?.payload as { phone?: string; gender?: string };
    expect(farmer.phone).toBe("+2290190000002");
    const farm = commands[1]?.payload as { declaredAreaHa: number; location: [number, number] };
    expect(farm.declaredAreaHa).toBe(2.5);
    expect(farm.location).toEqual([1.667, 9.708]);
  });

  it("rattache une culture pérenne à la campagne entière et répartit la surface", () => {
    const { commands } = buildCommands(complete, { ...context, newId });
    const seasons = commands
      .filter((command) => command.type === "cropSeason.declare")
      .map(
        (command) => command.payload as { cropCode: string; seasonCode: string; areaHa?: number },
      );
    expect(seasons.find((s) => s.cropCode === "MAIZE")?.areaHa).toBe(0.75);
    expect(seasons.find((s) => s.cropCode === "CASHEW")?.seasonCode).toBe("ANNUAL");
  });

  it("crée une parcelle implicite quand seules les cultures de l'exploitation sont connues", () => {
    const data: EnrolmentData = {
      ...complete,
      parcels: [],
      crops: { cropCodes: ["YAM"], seasonCode: "MAIN_RAINY" },
    };
    const { commands } = buildCommands(data, { ...context, newId });
    expect(commands.map((command) => command.type)).toEqual([
      "farmer.create",
      "farm.create",
      "parcel.create",
      "cropSeason.declare",
    ]);
    expect((commands[2]?.payload as { declaredAreaHa: number }).declaredAreaHa).toBe(2.5);
  });

  it("réutilise un producteur connu sans le recréer", () => {
    const data: EnrolmentData = {
      ...complete,
      farmer: {
        mode: "EXISTING",
        existingFarmerId: "01923456-0000-7000-8000-00000000f001",
        existingFarmerName: "Sabi Orou",
      },
    };
    const { commands } = buildCommands(data, { ...context, newId });
    expect(commands[0]?.type).toBe("farm.create");
    expect(commands[0]?.dependsOn).toBeUndefined();
    expect((commands[0]?.payload as { farmerId: string }).farmerId).toBe(
      "01923456-0000-7000-8000-00000000f001",
    );
  });

  it("refuse un brouillon incomplet en nommant le manque", () => {
    expect(() => buildCommands({ ...complete, consentAt: null }, context)).toThrow(
      EnrolmentIncompleteError,
    );
    expect(() =>
      buildCommands(
        { ...complete, size: { areaHa: "0", tenure: "OWNED", irrigation: "NONE" } },
        context,
      ),
    ).toThrow(/size.areaHa/);
  });
});

describe("submitEnrolment", () => {
  it("enfile les commandes, crée l'exploitation locale et clôt le brouillon", async () => {
    const db = new AgentDatabase(`test-enrolment-${crypto.randomUUID()}`);
    const draft = await createEnrolmentDraft(db);
    await saveEnrolmentSection(db, draft.id, complete, 5);

    const result = await submitEnrolment(db, draft.id, context);

    const outbox = await db.outbox.orderBy("sequence").toArray();
    expect(outbox.map((entry) => entry.type)).toEqual([
      "farmer.create",
      "farm.create",
      "parcel.create",
      "cropSeason.declare",
      "cropSeason.declare",
      "parcel.create",
      "cropSeason.declare",
    ]);
    expect(outbox.every((entry) => entry.status === "PENDING" && entry.draftId === draft.id)).toBe(
      true,
    );
    expect(outbox[1]?.dependsOn).toEqual([result.farmerId]);

    const farm = await db.farms.get(result.farmId);
    expect(farm?.syncState).toBe("LOCAL_ONLY");
    expect(farm?.farmerName).toBe("Adjoa Hounkpatin");
    expect(farm?.cropCodes.sort()).toEqual(["CASHEW", "COWPEA", "MAIZE"]);
    expect(farm?.code).toMatch(/^BJ-DON-003-L[0-9A-F]{6}$/);

    const stored = await db.drafts.get(draft.id);
    expect(stored?.status).toBe("SUBMITTED");
    expect(stored?.farmId).toBe(result.farmId);

    // Une seconde soumission ne duplique rien : le résultat mémorisé est renvoyé.
    const again = await submitEnrolment(db, draft.id, context);
    expect(again).toEqual(result);
    expect(await db.outbox.count()).toBe(7);
  });
});
