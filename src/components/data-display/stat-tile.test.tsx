import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("formate la valeur numérique en français", () => {
    render(<StatTile label="Agriculteurs" value={48213} />);
    expect(screen.getByText("48 213")).toBeInTheDocument();
  });

  it("affiche la source et le niveau de fiabilité", () => {
    render(
      <StatTile
        label="Superficie"
        value={12.5}
        unit="ha"
        source="registre"
        sourceDate="24 sept. 2026"
        reliability="FIELD_VERIFIED"
      />,
    );
    expect(screen.getByText(/Source : registre \(24 sept. 2026\)/)).toBeInTheDocument();
    expect(screen.getByText("Vérifié sur le terrain")).toBeInTheDocument();
    expect(screen.getByText("ha")).toBeInTheDocument();
  });

  it("signe la tendance et colore selon le sens souhaité", () => {
    const { rerender } = render(
      <StatTile label="Alertes" value={7} trend={{ value: -12.5, positiveIsGood: false }} />,
    );
    expect(screen.getByText("-12,5 %").parentElement).toHaveClass("text-success");

    rerender(<StatTile label="Production" value={7} trend={{ value: -12.5 }} />);
    expect(screen.getByText("-12,5 %").parentElement).toHaveClass("text-warning");

    rerender(<StatTile label="Production" value={7} trend={{ value: 3.4 }} />);
    expect(screen.getByText("+3,4 %")).toBeInTheDocument();
  });
});
