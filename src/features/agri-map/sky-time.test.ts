import { describe, expect, it } from "vitest";
import { defaultBeforePeriod, monthTimeline } from "./sky-time";

const PERIODS = [
  { period: "60-jours", rolling: true },
  { period: "2026-09", rolling: false },
  { period: "2026-07", rolling: false },
  { period: "2026-08", rolling: false },
];

describe("curseur temporel du ciel", () => {
  it("range les mois du plus ancien au plus récent, sans la fenêtre glissante", () => {
    expect(monthTimeline(PERIODS).map((entry) => entry.period)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("propose le mois précédent comme côté avant", () => {
    const timeline = monthTimeline(PERIODS);
    expect(defaultBeforePeriod(timeline, "2026-09")).toBe("2026-08");
    expect(defaultBeforePeriod(timeline, "2026-07")).toBeNull();
  });

  it("propose le mois le plus récent quand la période affichée est la fenêtre glissante", () => {
    const timeline = monthTimeline(PERIODS);
    expect(defaultBeforePeriod(timeline, "60-jours", true)).toBe("2026-09");
  });

  it("ne propose rien sans mois du calendrier dans le catalogue", () => {
    expect(defaultBeforePeriod([], "60-jours", true)).toBeNull();
  });
});
