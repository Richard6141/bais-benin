import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SurveyEstimates, TargetEstimate } from "@/modules/area-survey";
import { SurveySection } from "./survey-section";

// Surfaces par sondage telles que le ministère les lit (ADR-0033) : marge, CV et usage.

function estimate(target: string, overrides: Partial<TargetEstimate> = {}): TargetEstimate {
  return {
    target: target as TargetEstimate["target"],
    areaHa: 50_000,
    standardErrorHa: 2_000,
    marginHa: 3_920,
    cv: 0.04,
    points: 560,
    method: "regression",
    gain: 1.8,
    mapHa: 61_000,
    mapShared: false,
    status: "cite",
    ...overrides,
  };
}

const survey: SurveyEstimates & { campaignCode: string } = {
  campaignCode: "2026-2027",
  drawn: 600,
  observed: 560,
  inaccessible: 25,
  synthetic: false,
  totals: [
    estimate("CULTIVATED"),
    estimate("MAIZE", { mapShared: true, mapHa: 40_000 }),
    estimate("RICE", {
      areaHa: 900,
      marginHa: 700,
      cv: 0.4,
      status: "do-not-cite",
      gain: null,
      method: "direct",
    }),
  ],
  communes: [
    {
      communeId: "c1",
      code: "BJ-BOR-008",
      name: "Tchaourou",
      drawn: 120,
      observed: 110,
      inaccessible: 5,
      mapped: 120,
      responseRate: 110 / 115,
      targets: [estimate("CULTIVATED", { areaHa: 12_000, marginHa: 2_400, status: "indicative" })],
    },
  ],
};

describe("surfaces par sondage", () => {
  it("donne chaque surface avec sa marge, son CV et son usage", () => {
    render(<SurveySection survey={survey} />);
    const table = screen.getByRole("table", { name: /Communes d'enquête réunies/ });
    const rice = within(table).getByText("Riz").closest("tr")!;
    expect(within(rice).getByText("À ne pas citer")).toBeInTheDocument();
    expect(within(rice).getByText("Sans carte")).toBeInTheDocument();
    const cultivated = within(table).getByText("Terres cultivées").closest("tr")!;
    expect(within(cultivated).getByText("À citer")).toBeInTheDocument();
    expect(within(cultivated).getByText(/× 1,8/)).toBeInTheDocument();
    const maize = within(table).getByText("Maïs").closest("tr")!;
    expect(within(maize).getByText(/40\s000 \(annuelles\)/)).toBeInTheDocument();
  });

  it("montre la réponse et l'usage par commune", () => {
    render(<SurveySection survey={survey} />);
    const row = screen.getByText("Tchaourou").closest("tr")!;
    expect(within(row).getByText("96 %")).toBeInTheDocument();
    expect(within(row).getByText("Indicatif")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });
});
