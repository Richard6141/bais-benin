import { describe, expect, it, vi } from "vitest";

import { attentionOf, sortAffectedFarms, type AffectedFarm } from "../affected";

vi.mock("@/database/client", () => ({ prisma: {} }));

function farm(overrides: Partial<AffectedFarm>): AffectedFarm {
  const base: AffectedFarm = {
    farmId: "f",
    farmCode: "BJ-DON-DJO-000001",
    farmerName: "Producteur",
    village: null,
    phone: null,
    hasPhone: true,
    channels: { WHATSAPP: "SENT" },
    read: false,
    relay: null,
    attention: null,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, attention: attentionOf(merged) };
}

describe("priorité des exploitations à prévenir", () => {
  it("classe sans téléphone, échec d'envoi, non lu, puis lu ou relayé", () => {
    expect(attentionOf(farm({ hasPhone: false, channels: { RELAY: "PENDING" } }))).toBe("NO_PHONE");
    expect(attentionOf(farm({ channels: { WHATSAPP: "FAILED", SMS: "SKIPPED" } }))).toBe(
      "DELIVERY_FAILED",
    );
    expect(attentionOf(farm({ channels: { RELAY: "PENDING" } }))).toBe("DELIVERY_FAILED");
    // Un envoi réussi sur un canal suffit, même si l'autre a échoué.
    expect(attentionOf(farm({ channels: { WHATSAPP: "FAILED", SMS: "DELIVERED" } }))).toBe(
      "UNREAD",
    );
    expect(attentionOf(farm({ read: true }))).toBeNull();
    expect(
      attentionOf(farm({ relay: { byName: "Agent", mode: "CALL", at: new Date() } })),
    ).toBeNull();
  });

  it("trie par priorité puis par nom", () => {
    const sorted = sortAffectedFarms([
      farm({ farmId: "lu", farmerName: "Awa", read: true }),
      farm({ farmId: "non-lu", farmerName: "Bio" }),
      farm({ farmId: "echec-z", farmerName: "Zinsou", channels: { WHATSAPP: "FAILED" } }),
      farm({ farmId: "echec-a", farmerName: "Adjoa", channels: { WHATSAPP: "FAILED" } }),
      farm({
        farmId: "sans-tel",
        farmerName: "Yao",
        hasPhone: false,
        channels: { RELAY: "PENDING" },
      }),
    ]);
    expect(sorted.map((f) => f.farmId)).toEqual(["sans-tel", "echec-a", "echec-z", "non-lu", "lu"]);
  });
});
