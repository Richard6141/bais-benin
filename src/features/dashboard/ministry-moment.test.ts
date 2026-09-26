import { describe, expect, it } from "vitest";
import type { WatchSummary } from "@/modules/watch";
import { ministryMoment } from "./ministry-moment";

function summary(overrides: Partial<WatchSummary> = {}): WatchSummary {
  return {
    generatedAt: "2026-09-27T08:00:00.000Z",
    fires: { last24h: 0, last7d: 0, communes: 0 },
    exposure: { "24h": [], "7d": [] },
    reportGroups: [],
    cropCondition: null,
    alerts: { active: 0, bySeverity: { CRITICAL: 0, WARNING: 0, WATCH: 0, INFO: 0 }, items: [] },
    heldOutbreaks: [],
    levels: [],
    assistance: { received24h: 0, received7d: 0, waiting: 0, resolved7d: 0 },
    freshness: [],
    ...overrides,
  };
}

describe("ministryMoment", () => {
  it("dit le calme et ne propose rien quand rien n'attend", () => {
    const moment = ministryMoment(summary());
    expect(moment.sentence).toBe("Aucune alerte grave ni feu depuis hier.");
    expect(moment.actions).toEqual([]);
  });

  it("met les alertes graves d'abord, puis les feux près des producteurs", () => {
    const moment = ministryMoment(
      summary({
        alerts: {
          active: 5,
          bySeverity: { CRITICAL: 1, WARNING: 2, WATCH: 2, INFO: 0 },
          items: [],
        },
        fires: { last24h: 12, last7d: 40, communes: 4 },
        exposure: {
          "24h": [
            {
              commune_code: "BJ-BOR-001",
              commune_name: "Bembèrèkè",
              fires: 3,
              farms: 4,
              producers: 4,
            },
          ],
          "7d": [],
        },
        assistance: { received24h: 1, received7d: 3, waiting: 2, resolved7d: 1 },
      } as Partial<WatchSummary>),
    );
    expect(moment.sentence).toBe(
      "3 alertes graves, 12 feux en 24 heures et 2 demandes en attente.",
    );
    expect(moment.actions.map((action) => action.title)).toEqual([
      "Examiner 3 alertes graves",
      "Suivre 12 feux des dernières 24 heures",
      "Suivre 2 demandes en attente",
    ]);
    expect(moment.actions[1]?.detail).toBe("4 producteurs à moins de 1 km d'un feu.");
    expect(moment.actions[1]?.urgent).toBe(true);
  });

  it("signale une culture dont un cinquième de la surface est en état faible", () => {
    const moment = ministryMoment(
      summary({
        cropCondition: {
          campaignCode: "2026-2027",
          demo: false,
          worst: [{ code: "MAIZE", name: "Maïs", poorShare: 0.31, observedHa: 1200 }],
        },
      }),
    );
    expect(moment.actions).toHaveLength(1);
    expect(moment.actions[0]?.detail).toMatch(
      /^Maïs : 31\s% de la surface observée en état faible\.$/,
    );
  });
});
