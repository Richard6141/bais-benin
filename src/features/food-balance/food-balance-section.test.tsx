import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommuneBalance, FoodBalanceView } from "@/modules/food-balance";
import { FoodBalanceSection } from "./food-balance-section";

// Bilan alimentaire tel que le ministère le lit (ADR-0035) : statut, fourchette, source des
// surfaces, communes non évaluées et coefficients cités.

function commune(overrides: Partial<CommuneBalance>): CommuneBalance {
  return {
    code: "BJ-X",
    name: "Commune",
    population: 100_000,
    needsKcal: 1,
    availableKcal: { central: 1, low: 1, high: 1 },
    coverage: { central: 0.6, low: 0.5, high: 0.7 },
    status: "deficit",
    toConfirm: false,
    confirmReasons: [],
    crops: [
      {
        cropCode: "MAIZE",
        label: "Maïs",
        areaHa: 1000,
        productionT: 1200,
        productionLowT: 900,
        productionHighT: 1500,
        kcal: 1,
        source: { kind: "survey", campaignCode: "2026-2027", cv: 0.12 },
        yieldBasis: "commune",
      },
    ],
    missingCrops: [],
    reason: null,
    ...overrides,
  };
}

const view: FoodBalanceView = {
  campaignCode: "2026-2027",
  historyCampaigns: ["2024-2025", "2025-2026"],
  population: { year: 2026, dataset: "WorldPop Global2 R2025A v1" },
  communes: [
    commune({ code: "BJ-A", name: "Aplahoué" }),
    commune({
      code: "BJ-B",
      name: "Banikoara",
      status: "tension",
      toConfirm: true,
      confirmReasons: ["La fourchette chevauche un seuil."],
      coverage: { central: 0.95, low: 0.8, high: 1.1 },
    }),
    commune({
      code: "BJ-C",
      name: "Cotonou",
      status: "not-evaluated",
      coverage: null,
      crops: [],
      reason: "Aucune surface de toute la commune",
    }),
  ],
  counts: { deficit: 1, tension: 1, covered: 0, "not-evaluated": 1 },
  nationalCheck: { year: "2024", coverage: 1.38, populationYear: 2026 },
};

describe("bilan alimentaire", () => {
  it("donne statut, fourchette et source des surfaces de chaque commune", () => {
    render(<FoodBalanceSection view={view} />);
    const deficit = screen.getByText("Aplahoué").closest("tr")!;
    expect(within(deficit).getByText("Déficit grave")).toBeInTheDocument();
    expect(within(deficit).getByText(/60\s%\s\(50\s%\sà 70\s%\)/)).toBeInTheDocument();
    expect(within(deficit).getByText("Enquête 2026-2027")).toBeInTheDocument();
    const tension = screen.getByText("Banikoara").closest("tr")!;
    expect(within(tension).getByText("À confirmer")).toBeInTheDocument();
    expect(
      within(tension).getByRole("button", { name: /Pourquoi Banikoara est à confirmer/ }),
    ).toBeInTheDocument();
    const missing = screen.getByText("Cotonou").closest("tr")!;
    expect(within(missing).getByText("Non évaluée")).toBeInTheDocument();
    expect(within(missing).getByText("Aucune surface de toute la commune")).toBeInTheDocument();
  });

  it("cite le contrôle national et chaque coefficient", () => {
    render(<FoodBalanceSection view={view} />);
    expect(screen.getByText(/production FAOSTAT 2024/)).toBeInTheDocument();
    expect(screen.getByText("335 (01_014)")).toBeInTheDocument();
    expect(screen.getByText(/2\s237 kcal par personne et par jour/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });
});
