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
    // Un envoi réussi sur un canal suffit, même si l'autre a échoué.
    expect(attentionOf(farm({ channels: { WHATSAPP: "FAILED", SMS: "DELIVERED" } }))).toBe(
      "UNREAD",
    );
    // Un message encore en file (silence nocturne) attend sa lecture, ce n'est pas un échec.
    expect(attentionOf(farm({ channels: { WHATSAPP: "PENDING" } }))).toBe("UNREAD");
    expect(attentionOf(farm({ read: true }))).toBeNull();
    expect(
      attentionOf(farm({ relay: { byName: "Agent", mode: "CALL", at: new Date() } })),
    ).toBeNull();
  });

  it("ne compte jamais un envoi écarté comme un échec", () => {
    // Écarté partout, application ouverte : le producteur a l'alerte dans son espace.
    expect(
      attentionOf(farm({ channels: { IN_APP: "SENT", WHATSAPP: "SKIPPED", SMS: "SKIPPED" } })),
    ).toBe("UNREAD");
    // Écarté, relais de l'agent prévu : non envoyé.
    expect(attentionOf(farm({ channels: { WHATSAPP: "SKIPPED", RELAY: "PENDING" } }))).toBe(
      "NOT_SENT",
    );
    expect(attentionOf(farm({ channels: { RELAY: "PENDING" } }))).toBe("NOT_SENT");
    // Aucun canal abouti et aucun relais : à prévenir de vive voix.
    expect(attentionOf(farm({ channels: { WHATSAPP: "SKIPPED" } }))).toBe("TO_CALL");
    expect(attentionOf(farm({ channels: { WHATSAPP: "SKIPPED", RELAY: "SKIPPED" } }))).toBe(
      "TO_CALL",
    );
    expect(attentionOf(farm({ channels: {} }))).toBe("TO_CALL");
  });

  it("trie par priorité puis par nom", () => {
    const sorted = sortAffectedFarms([
      farm({ farmId: "lu", farmerName: "Awa", read: true }),
      farm({ farmId: "non-lu", farmerName: "Bio" }),
      farm({ farmId: "echec-z", farmerName: "Zinsou", channels: { WHATSAPP: "FAILED" } }),
      farm({ farmId: "echec-a", farmerName: "Adjoa", channels: { WHATSAPP: "FAILED" } }),
      farm({
        farmId: "non-envoye",
        farmerName: "Codjo",
        channels: { WHATSAPP: "SKIPPED", RELAY: "PENDING" },
      }),
      farm({ farmId: "vive-voix", farmerName: "Dossou", channels: { WHATSAPP: "SKIPPED" } }),
      farm({
        farmId: "sans-tel",
        farmerName: "Yao",
        hasPhone: false,
        channels: { RELAY: "PENDING" },
      }),
    ]);
    expect(sorted.map((f) => f.farmId)).toEqual([
      "sans-tel",
      "vive-voix",
      "echec-a",
      "echec-z",
      "non-envoye",
      "non-lu",
      "lu",
    ]);
  });
});
