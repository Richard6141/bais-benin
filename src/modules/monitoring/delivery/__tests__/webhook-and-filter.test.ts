import { describe, expect, it, vi } from "vitest";

import { parseRuleDefinition } from "@/modules/monitoring/rules";
import { signWapyPayload, verifyWapySignature } from "@/services/messaging/wapy/webhook-signature";
import { cropFilterFromDefinition } from "../crop-filter";
import { applyWapyEvent, isAcknowledgementReply, wapyEventSchema } from "../webhook";
import type { Db } from "../plan";

// Fonctions pures uniquement : la base n'est jamais ouverte.
vi.mock("@/database/client", () => ({ prisma: {} }));

describe("filtre de cultures d'une règle", () => {
  it("lit crop_in et crop_stage_in, y compris imbriqués, et ignore les négations", () => {
    const definition = parseRuleDefinition({
      all: [
        { indicator: "crop_in", value: ["MAIZE"] },
        { any: [{ indicator: "crop_stage_in", value: ["GROWING", "FLOWERING"] }] },
        { not: { indicator: "crop_in", value: ["COTTON"] } },
        { indicator: "rain_sum_10d", op: "<", value: 5 },
      ],
    });
    expect(cropFilterFromDefinition(definition)).toEqual({
      cropCodes: ["MAIZE"],
      stages: ["FLOWERING", "GROWING"],
    });
  });

  it("renvoie un filtre vide pour une règle sans condition de culture", () => {
    const definition = parseRuleDefinition({ indicator: "rain_sum_3d", op: ">=", value: 120 });
    expect(cropFilterFromDefinition(definition)).toEqual({ cropCodes: null, stages: null });
  });
});

describe("signature du webhook wapy.pro", () => {
  const body = JSON.stringify({ evenement: "remise", message_id: "3EB0", remise: "lu" });

  it("accepte la bonne signature et refuse une signature altérée ou absente", () => {
    const header = signWapyPayload(body, "secret-test");
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWapySignature(body, header, "secret-test")).toBe(true);
    expect(verifyWapySignature(`${body} `, header, "secret-test")).toBe(false);
    expect(verifyWapySignature(body, header, "autre-secret")).toBe(false);
    expect(verifyWapySignature(body, null, "secret-test")).toBe(false);
    expect(verifyWapySignature(body, "sha256=abc", "secret-test")).toBe(false);
  });
});

describe("fenêtre de fraîcheur des événements wapy.pro (C4/rejeu)", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const unusedDb = {} as Db;

  it("refuse un événement de remise dont l'horodatage signé est trop ancien", async () => {
    const result = await applyWapyEvent(
      {
        evenement: "remise",
        message_id: "3EB0",
        remise: "lu",
        remise_le: "2026-09-25T11:00:00Z", // une heure avant `now` : hors fenêtre de 15 minutes.
      },
      now,
      unusedDb,
    );
    expect(result).toEqual({
      handled: false,
      reason: "Horodatage hors fenêtre de fraîcheur (rejeu potentiel)",
    });
  });

  it("refuse un événement de réponse dont l'horodatage signé est dans le futur", async () => {
    const result = await applyWapyEvent(
      { evenement: "reponse", de: "+22901000000", texte: "OK", recu_le: "2026-09-25T12:30:00Z" },
      now,
      unusedDb,
    );
    expect(result.handled).toBe(false);
  });

  it("n'est pas soumis à la fenêtre quand aucun horodatage n'est fourni", async () => {
    // Compatibilité : le champ est optionnel dans le contrat. applyWapyEvent poursuit alors son
    // traitement normal (ici : aucun message connu, refusé pour une autre raison que le rejeu).
    const result = await applyWapyEvent(
      { evenement: "remise", message_id: "inconnu", remise: "lu" },
      now,
      { alertRecipient: { updateMany: async () => ({ count: 0 }) } } as unknown as Db,
    );
    expect(result).toEqual({
      handled: false,
      reason: "Message inconnu ou statut déjà plus avancé",
    });
  });
});

describe("événements wapy.pro", () => {
  it("valide les accusés de remise et les réponses", () => {
    expect(
      wapyEventSchema.safeParse({ evenement: "remise", message_id: "3EB0", remise: "appareil" })
        .success,
    ).toBe(true);
    expect(
      wapyEventSchema.safeParse({ evenement: "reponse", de: "+2290190000002", texte: "OK" })
        .success,
    ).toBe(true);
    expect(
      wapyEventSchema.safeParse({ evenement: "remise", message_id: "3EB0", remise: "vu" }).success,
    ).toBe(false);
    expect(wapyEventSchema.safeParse({ evenement: "inconnu" }).success).toBe(false);
  });

  it.each([
    ["OK", true],
    ["ok !", true],
    ["Oui", true],
    ["D'accord", true],
    ["daccord", true],
    ["Compris.", true],
    ["Non", false],
    ["Il pleut chez nous", false],
  ])("« %s » vaut accusé de lecture : %s", (text, expected) => {
    expect(isAcknowledgementReply(text)).toBe(expected);
  });
});
