import { describe, expect, it } from "vitest";

import {
  filterByDepartement,
  freshnessOf,
  parseCenterFilters,
  summarizeDelivery,
  unreadCount,
} from "./monitoring-logic";

const NOW = new Date("2026-09-25T12:00:00Z").getTime();

describe("freshnessOf", () => {
  it("signale l'absence d'ingestion", () => {
    expect(freshnessOf(null, NOW).state).toBe("NONE");
    expect(freshnessOf(null, NOW).warning).toMatch(/Aucune donnée météo/);
  });

  it("juge fraîches les données de moins de 48 h", () => {
    const f = freshnessOf(
      {
        finishedAt: "2026-09-25T05:00:00Z",
        provider: "OPEN_METEO",
        fallback: false,
        status: "SUCCEEDED",
      },
      NOW,
    );
    expect(f.state).toBe("FRESH");
    expect(f.label).toBe("À jour, il y a 7 h");
    expect(f.warning).toBeNull();
  });

  it("suspend les alertes au-delà de 48 h", () => {
    const f = freshnessOf(
      {
        finishedAt: "2026-09-22T05:00:00Z",
        provider: "OPEN_METEO",
        fallback: false,
        status: "SUCCEEDED",
      },
      NOW,
    );
    expect(f.state).toBe("STALE");
    expect(f.warning).toMatch(/alertes suspendues/);
  });

  it("met le repli de démonstration avant l'ancienneté", () => {
    const f = freshnessOf(
      {
        finishedAt: "2026-09-25T11:40:00Z",
        provider: "fixture",
        fallback: true,
        status: "PARTIAL",
      },
      NOW,
    );
    expect(f.state).toBe("FALLBACK");
    expect(f.label).toBe("Démonstration, il y a moins d'une heure");
  });
});

describe("résumés", () => {
  it("compte les alertes non lues", () => {
    expect(
      unreadCount([{ readAt: null }, { readAt: "2026-09-24T08:00:00Z" }, { readAt: null }]),
    ).toBe(2);
  });

  it("regroupe la diffusion par canal dans l'ordre de l'entonnoir", () => {
    const summary = summarizeDelivery([
      { channel: "WHATSAPP", status: "READ", count: 40 },
      { channel: "WHATSAPP", status: "SENT", count: 60 },
      { channel: "WHATSAPP", status: "FAILED", count: 5 },
      { channel: "IN_APP", status: "PENDING", count: 12 },
    ]);
    expect(summary[0]).toMatchObject({ channel: "WHATSAPP", label: "WhatsApp", total: 105 });
    expect(summary[0]?.byStatus.map((s) => s.label)).toEqual(["Envoyés", "Lus", "Échecs"]);
    expect(summary[1]?.label).toBe("Application");
  });
});

describe("filtres du centre d'alertes", () => {
  it("ignore les valeurs inconnues de l'adresse", () => {
    expect(
      parseCenterFilters({ severite: "WARNING", categorie: "FLOOD", departement: "BJ-OU" }),
    ).toEqual({
      severity: "WARNING",
      category: "FLOOD",
      departementCode: "BJ-OU",
    });
    expect(
      parseCenterFilters({
        severite: "PANIQUE",
        categorie: ["HEAT", "PEST"],
        departement: "ouémé",
      }),
    ).toEqual({
      severity: undefined,
      category: "HEAT",
      departementCode: undefined,
    });
  });

  it("filtre par département via la table des communes", () => {
    const items = [{ communeCode: "BJ-DON-003" }, { communeCode: "BJ-OUE-002" }];
    const table = new Map([
      ["BJ-DON-003", "BJ-DO"],
      ["BJ-OUE-002", "BJ-OU"],
    ]);
    expect(filterByDepartement(items, "BJ-OU", table)).toEqual([{ communeCode: "BJ-OUE-002" }]);
    expect(filterByDepartement(items, undefined, table)).toHaveLength(2);
  });
});
