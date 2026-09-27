import { describe, expect, it } from "vitest";
import { defaultBeforePeriod, monthTimeline } from "./sky-time";

const PERIODS = [
  { period: "60-jours", rolling: true, current: true },
  { period: "2026-09", rolling: false, current: true },
  { period: "2026-07", rolling: false, current: false },
  { period: "2026-08", rolling: false, current: false },
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

  it("propose le dernier mois complet quand la période affichée est la fenêtre glissante", () => {
    const timeline = monthTimeline(PERIODS);
    // Septembre est encore en cours (incomplet) : le mois « avant » est août, pas septembre.
    expect(defaultBeforePeriod(timeline, "60-jours", true)).toBe("2026-08");
  });

  it("ne propose rien sans mois complet dans le catalogue", () => {
    expect(defaultBeforePeriod([], "60-jours", true)).toBeNull();
    const onlyCurrent = [{ period: "2026-09", rolling: false, current: true }];
    expect(defaultBeforePeriod(onlyCurrent, "60-jours", true)).toBeNull();
  });
});
