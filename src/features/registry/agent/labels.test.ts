import { describe, expect, it } from "vitest";
import { TENURE_LABELS, formatHa, formatPosition } from "./labels";

describe("libellés du registre", () => {
  it("formate une position à la française avec les hémisphères", () => {
    expect(formatPosition({ lat: 9.7, lng: 1.67 })).toBe("9,70000° N, 1,67000° E");
    expect(formatPosition(null)).toBe("—");
  });

  it("formate les surfaces en hectares avec la virgule décimale", () => {
    expect(formatHa(2.5)).toBe("2,5 ha");
    expect(formatHa(null)).toBe("—");
  });

  it("couvre toutes les valeurs du mode de faire-valoir du modèle de données", () => {
    for (const value of ["OWNED", "RENTED", "FAMILY", "SHARED", "UNKNOWN"]) {
      expect(TENURE_LABELS[value]).toBeTruthy();
    }
  });
});
