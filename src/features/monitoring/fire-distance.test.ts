import { describe, expect, it } from "vitest";
import { formatFireDistance } from "./fire-distance";

describe("distance d'un feu affichée au producteur", () => {
  it("donne des mètres arrondis en dessous d'un kilomètre", () => {
    expect(formatFireDistance(320)).toBe("320 m");
    expect(formatFireDistance(999.6)).toBe("1000 m");
  });

  it("passe au kilomètre à une décimale au-delà", () => {
    expect(formatFireDistance(1000)).toBe("1 km");
    expect(formatFireDistance(1650)).toBe("1,7 km");
  });
});
