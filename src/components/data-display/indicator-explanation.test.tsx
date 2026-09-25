import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndicatorExplanation, parseExplainedLines } from "./indicator-explanation";

// Phrases au format de explainTrace (src/modules/monitoring/rules/evaluate.ts).
const lines = [
  "Cumul de pluie sur 10 jours : 3 mm, seuil < 5 mm (remplie).",
  "Température maximale prévue : 34 °C, seuil ≥ 36 °C (non remplie).",
  "Humidité du sol : –, seuil < 20 % (non évaluable).",
];

describe("IndicatorExplanation", () => {
  it("lit l'état de chaque condition dans les phrases de explainTrace", () => {
    expect(parseExplainedLines(lines)).toEqual([
      { text: "Cumul de pluie sur 10 jours : 3 mm, seuil < 5 mm.", status: "MET" },
      { text: "Température maximale prévue : 34 °C, seuil ≥ 36 °C.", status: "NOT_MET" },
      { text: "Humidité du sol : –, seuil < 20 %.", status: "UNKNOWN" },
    ]);
  });

  it("affiche chaque condition avec son état en toutes lettres et le décompte", () => {
    const { container } = render(<IndicatorExplanation conditions={parseExplainedLines(lines)} />);
    expect(screen.getByText(/1 condition remplie sur 3/)).toBeInTheDocument();
    expect(screen.getByText("remplie")).toBeInTheDocument();
    expect(screen.getByText("non remplie")).toBeInTheDocument();
    expect(screen.getByText("non évaluable")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-status="MET"]')).toHaveLength(1);
  });
});
