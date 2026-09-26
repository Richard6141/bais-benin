import { describe, expect, it } from "vitest";
import type { WatchSummary } from "@/modules/watch";
import { highlights } from "./situation-room";

const summary = (over: Partial<WatchSummary>): WatchSummary => ({
  generatedAt: "2026-09-26T10:00:00.000Z",
  fires: { last24h: 0, last7d: 0, communes: 0 },
  exposure: { "24h": [], "7d": [] },
  reportGroups: [],
  cropCondition: null,
  alerts: { active: 0, bySeverity: { INFO: 0, WATCH: 0, WARNING: 0, CRITICAL: 0 }, items: [] },
  heldOutbreaks: [],
  levels: [],
  assistance: { received24h: 0, received7d: 0, waiting: 0, resolved7d: 0 },
  freshness: [],
  ...over,
});

describe("bandeau de la salle de situation", () => {
  it("dit que tout est calme quand il n'y a rien", () => {
    expect(highlights(summary({}))).toEqual(["Aucun fait marquant : la situation est calme."]);
  });

  it("accorde les pluriels en toutes lettres, sans parenthèses ni séparateur interdit", () => {
    const lines = highlights(
      summary({
        alerts: {
          active: 3,
          bySeverity: { INFO: 0, WATCH: 1, WARNING: 1, CRITICAL: 1 },
          items: [],
        },
        fires: { last24h: 1, last7d: 4, communes: 1 },
        exposure: {
          "24h": [
            {
              commune_code: "BJ-BOR-008",
              commune_name: "Tchaourou",
              fires: 2,
              farms: 3,
              producers: 2,
            },
          ],
          "7d": [],
        },
        assistance: { received24h: 2, received7d: 5, waiting: 1, resolved7d: 3 },
      }),
    );
    expect(lines).toContain("3 alertes actives, dont 1 critique");
    expect(lines).toContain("1 feu détecté en 24 heures, dans 1 commune");
    expect(lines).toContain("Feux près des parcelles à Tchaourou : 2 producteurs exposés");
    expect(lines).toContain("1 demande d'aide en attente de prise en charge");
    expect(lines.join(" ")).not.toMatch(/\(s\)|·|…|—/);
  });
});
