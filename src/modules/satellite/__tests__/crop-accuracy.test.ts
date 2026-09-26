import { describe, expect, it, vi } from "vitest";

// Matrice de confusion de la carte des cultures (ADR-0021) : calculs purs, base simulée.

vi.mock("@/database/client", () => ({ prisma: {} }));
vi.mock("@/database/sql/crop-accuracy.sql", () => ({}));
vi.mock("@/database/sql/crop-areas.sql", () => ({}));
vi.mock("@/database/sql/satellite.sql", () => ({}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({}) }));

const { confusionMatrix, majorityClass } = await import("../crop-accuracy");

describe("classe dominante d'une parcelle", () => {
  it("retient la classe la plus fréquente parmi les pixels classés", () => {
    expect(majorityClass([50, 0, 60, 25, 0, 0, 5, 0, 0, 0])).toEqual({
      observed: "ANNUAL",
      classified: 90,
    });
  });

  it("ne conclut pas sur trop peu de pixels classés", () => {
    expect(majorityClass([80, 0, 12, 0, 0, 0, 3, 0, 0, 0]).observed).toBe("UNCLASSIFIED");
  });
});

describe("matrice de confusion", () => {
  const matrix = confusionMatrix([
    { declared: "ANNUAL", observed: "ANNUAL", count: 80 },
    { declared: "ANNUAL", observed: "COTTON", count: 15 },
    { declared: "ANNUAL", observed: "NATURAL", count: 5 },
    { declared: "COTTON", observed: "COTTON", count: 30 },
    { declared: "COTTON", observed: "ANNUAL", count: 10 },
    { declared: "RICE", observed: "RICE", count: 4 },
    { declared: "RICE", observed: "UNCLASSIFIED", count: 6 },
  ]);

  it("donne la précision globale sur les parcelles classées seulement", () => {
    expect(matrix.checked).toBe(144);
    expect(matrix.unclassified).toBe(6);
    expect(matrix.overallAccuracy).toBeCloseTo(114 / 144, 5);
  });

  it("sépare parcelles reconnues et fiabilité de la classe", () => {
    const annual = matrix.classes.find((entry) => entry.cropClass === "ANNUAL")!;
    expect(annual.recall).toBeCloseTo(0.8, 5);
    expect(annual.precision).toBeCloseTo(80 / 90, 5);
    expect(annual.mainConfusion).toEqual({ observed: "COTTON", share: 0.15 });
    const cotton = matrix.classes.find((entry) => entry.cropClass === "COTTON")!;
    expect(cotton.recall).toBeCloseTo(0.75, 5);
    expect(cotton.precision).toBeCloseTo(30 / 45, 5);
  });

  it("n'affiche pas de taux sur un échantillon trop petit", () => {
    const rice = matrix.classes.find((entry) => entry.cropClass === "RICE")!;
    expect(rice.parcels).toBe(4);
    expect(rice.recall).toBeNull();
  });

  it("ne garde que les colonnes observées", () => {
    expect(matrix.observedColumns).toEqual(["RICE", "ANNUAL", "COTTON", "NATURAL"]);
  });
});
