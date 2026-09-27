import { describe, expect, it, vi } from "vitest";
import type { FarmFireExposure } from "@/database/sql/fires.sql";
import { deliveryAlertFor } from "../dispatch";

vi.mock("@/database/client", () => ({ prisma: {} }));

// Envoi d'une alerte feu (ADR-0022) : texte et gravité propres à chaque exploitation.

const now = new Date("2026-09-27T15:00:00Z");
const alert = {
  id: "a",
  severity: "CRITICAL" as const,
  reliability: "ESTIMATED",
  status: "ACTIVE",
  messageShort: "BAIS Djougou : feu détecté par satellite près de vos parcelles.",
  category: "FIRE",
};
const exposure = (distanceM: number): FarmFireExposure => ({
  farmId: "f",
  distanceM,
  parcel: { lat: 9.7, lon: 1.67 },
  fire: { lat: 9.704, lon: 1.674 },
  detectedAt: new Date("2026-09-27T13:05:00Z"),
  cropName: "Maïs",
});

describe("alerte feu adressée à une exploitation", () => {
  it("dit la distance et la direction depuis SA parcelle, sur WhatsApp comme par SMS", () => {
    const whatsapp = deliveryAlertFor(alert, "WHATSAPP", exposure(620), now);
    expect(whatsapp.messageShort).toContain("environ 600 m au nord-est de votre champ de maïs");
    expect(whatsapp.messageShort).toContain("118");
    const sms = deliveryAlertFor(alert, "SMS", exposure(620), now);
    expect(sms.messageShort.length).toBeLessThanOrEqual(160);
    expect(sms.messageShort).toContain("au nord-est");
  });

  it("n'est critique, donc envoyée la nuit, que sous 500 m de sa parcelle", () => {
    expect(deliveryAlertFor(alert, "WHATSAPP", exposure(300), now).severity).toBe("CRITICAL");
    // L'alerte de la commune est critique, mais le feu est à 800 m de cette exploitation.
    expect(deliveryAlertFor(alert, "WHATSAPP", exposure(800), now).severity).toBe("WARNING");
  });

  it("garde le texte commun sans feu retrouvé, et ne touche pas aux autres alertes", () => {
    const { id, severity, reliability, status, messageShort } = alert;
    const common = { id, severity, reliability, status, messageShort };
    expect(deliveryAlertFor(alert, "WHATSAPP", undefined, now)).toEqual(common);
    expect(deliveryAlertFor({ ...alert, category: "PEST" }, "SMS", exposure(300), now)).toEqual(
      common,
    );
  });
});
