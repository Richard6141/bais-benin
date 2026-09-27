import { describe, expect, it } from "vitest";
import { burnFigures, burnWindows } from "../burned-area-rules";

// Surface brûlée (ADR-0038 §2) : fenêtres autour du feu, fourchette de surface, image
// insuffisante et seuil de la déclaration de sinistre.

describe("surface brûlée d'une parcelle", () => {
  it("lit 20 jours avant le feu, 15 après, et mesure entre 15 et 30 jours", () => {
    const windows = burnWindows(new Date("2026-12-10T13:30:00Z"));
    expect(windows.preFrom.toISOString()).toBe("2026-11-20T13:30:00.000Z");
    expect(windows.postTo.toISOString()).toBe("2026-12-25T13:30:00.000Z");
    expect(windows.measureAfter.toISOString()).toBe("2026-12-25T13:30:00.000Z");
    expect(windows.expiresAt.toISOString()).toBe("2027-01-09T13:30:00.000Z");
  });

  it("donne une fourchette : brûlé et sévère en bas, brûlé possible en plus en haut", () => {
    // 100 pixels : 10 sans image nette, 50 intacts, 10 possibles, 24 brûlés, 6 sévères ; 2 ha.
    const figures = burnFigures([10, 50, 10, 24, 6], 2);
    expect(figures.validShare).toBe(0.9);
    expect(figures.lowShare).toBeCloseTo(30 / 90, 4);
    expect(figures.highShare).toBeCloseTo(40 / 90, 4);
    expect(figures.severeShare).toBeCloseTo(6 / 90, 4);
    expect(figures.lowHa).toBeCloseTo((2 * 30) / 90, 3);
    expect(figures.highHa).toBeCloseTo((2 * 40) / 90, 3);
    expect(figures.sufficient).toBe(true);
    expect(figures.proposesDeclaration).toBe(true);
  });

  it("ne donne pas de surface sous 60 % de pixels nets", () => {
    const figures = burnFigures([50, 20, 0, 30, 0], 3);
    expect(figures.validShare).toBe(0.5);
    expect(figures.sufficient).toBe(false);
    expect(figures.lowHa).toBe(0);
    expect(figures.proposesDeclaration).toBe(false);
  });

  it("ne propose de sinistre qu'à partir de 0,1 ha ou 10 % brûlés", () => {
    // 5 % brûlés d'une parcelle de 1 ha : 0,05 ha, sous les deux seuils.
    expect(burnFigures([0, 95, 0, 5, 0], 1).proposesDeclaration).toBe(false);
    // 5 % brûlés de 4 ha : 0,2 ha, au-dessus de 0,1 ha.
    expect(burnFigures([0, 95, 0, 5, 0], 4).proposesDeclaration).toBe(true);
    // Brûlé possible seulement : haut de fourchette, pas de déclaration.
    const possibleOnly = burnFigures([0, 60, 40, 0, 0], 3);
    expect(possibleOnly.highHa).toBeCloseTo(1.2, 3);
    expect(possibleOnly.proposesDeclaration).toBe(false);
  });
});
