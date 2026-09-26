import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CropMapAccuracy } from "@/modules/satellite";
import { CropAccuracySection } from "./crop-accuracy-section";

// Précision de la carte des cultures, telle que le ministère la lit.

const counts = (entries: Record<string, number>) => ({
  UNCLASSIFIED: 0,
  RICE: 0,
  ANNUAL: 0,
  COTTON: 0,
  PERENNIAL: 0,
  GARDEN: 0,
  FALLOW: 0,
  NATURAL: 0,
  WATER: 0,
  BUILT: 0,
  ...entries,
});

const accuracy: CropMapAccuracy = {
  campaignCode: "2026-2027",
  fieldVerified: 60,
  checked: 140,
  unclassified: 6,
  overallAccuracy: 0.79,
  classes: [
    {
      cropClass: "ANNUAL",
      parcels: 100,
      correct: 80,
      recall: 0.8,
      precision: 0.89,
      mainConfusion: { observed: "COTTON", share: 0.15 },
    },
    {
      cropClass: "RICE",
      parcels: 4,
      correct: 4,
      recall: null,
      precision: null,
      mainConfusion: null,
    },
  ],
  rows: [
    { declared: "ANNUAL", counts: counts({ ANNUAL: 80, COTTON: 15, NATURAL: 5 }) },
    { declared: "RICE", counts: counts({ RICE: 4 }) },
  ],
  observedColumns: ["RICE", "ANNUAL", "COTTON", "NATURAL"],
  sources: [{ sourceId: "COPERNICUS_S2", lastComputedAt: new Date("2026-10-09") }],
};

describe("précision de la carte des cultures", () => {
  it("donne la précision globale et la confusion principale par culture", () => {
    render(<CropAccuracySection accuracy={accuracy} />);
    expect(screen.getByText("79 %")).toBeInTheDocument();
    expect(screen.getByText("Coton (15 %)")).toBeInTheDocument();
    expect(screen.getAllByText("Trop peu").length).toBeGreaterThan(0);
  });

  it("montre la matrice, culture déclarée en lignes", () => {
    render(<CropAccuracySection accuracy={accuracy} />);
    const matrix = screen.getByRole("table", { name: /classe vue par satellite en colonnes/ });
    const rows = within(matrix).getAllByRole("row");
    expect(rows[0]).toHaveTextContent("Déclarée");
    expect(rows[1]).toHaveTextContent("Maïs et cultures annuelles");
    expect(
      within(rows[1]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["0", "80", "15", "5"]);
  });
});
