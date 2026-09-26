import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CropAreaComparison } from "@/modules/satellite";
import { CropAreaSection } from "./crop-area-section";

// Vue du ministère (ADR-0021) : ce que la page dit d'une estimation satellite face au registre.

const figures = (satelliteHa: number, declaredHa: number) => ({
  satelliteHa,
  declaredHa,
  enrolmentRate: satelliteHa >= 50 ? declaredHa / satelliteHa : null,
  gapHa: Math.max(0, satelliteHa - declaredHa),
});

const comparison: CropAreaComparison = {
  campaignCode: "2026-2027",
  cropClass: null,
  totals: { ...figures(12_000, 3_000), communes: 77, estimatedCommunes: 2 },
  byClass: [
    { cropClass: "ANNUAL", ...figures(10_000, 2_500) },
    { cropClass: "RICE", ...figures(30, 40) },
  ],
  departements: [{ code: "BJ-AL", name: "Alibori", ...figures(12_000, 3_000) }],
  communes: [
    {
      code: "BJ-ALI-001",
      name: "Banikoara",
      departementName: "Alibori",
      unclassifiedShare: 0.04,
      ...figures(9_000, 1_000),
    },
    {
      code: "BJ-ALI-002",
      name: "Gogounou",
      departementName: "Alibori",
      unclassifiedShare: 0.02,
      ...figures(3_000, 2_000),
    },
  ],
  sources: [{ sourceId: "COPERNICUS_S2", computedAt: new Date("2026-10-02"), resolutionM: 120 }],
  radarRice: true,
};

describe("surfaces par satellite face au registre", () => {
  it("donne le taux d'enrôlement et la surface à enregistrer, en estimation", () => {
    render(<CropAreaSection comparison={comparison} />);
    expect(screen.getAllByText("25 %").length).toBeGreaterThan(0);
    expect(screen.getByText("Taux d'enrôlement")).toBeInTheDocument();
    expect(screen.getByText("Estimation satellite, à confirmer")).toBeInTheDocument();
    expect(screen.getByText(/pixels de 120 m/)).toBeInTheDocument();
    expect(screen.getByText(/riz complété par le radar Sentinel-1/)).toBeInTheDocument();
  });

  it("classe les communes au plus gros écart d'abord", () => {
    render(<CropAreaSection comparison={comparison} />);
    const table = screen.getByRole("table", { name: /Communes où envoyer les agents/ });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Banikoara");
    expect(rows[2]).toHaveTextContent("Gogounou");
  });

  it("ne calcule pas de taux sur une surface vue trop petite", () => {
    render(<CropAreaSection comparison={comparison} />);
    const table = screen.getByRole("table", { name: /^Par culture/ });
    expect(within(table).getByText("Non calculé")).toBeInTheDocument();
  });
});
