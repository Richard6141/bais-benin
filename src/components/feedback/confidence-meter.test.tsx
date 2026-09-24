import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfidenceMeter } from "./confidence-meter";

describe("ConfidenceMeter", () => {
  it("expose le niveau comme jauge accessible", () => {
    render(<ConfidenceMeter level="MEDIUM" />);
    const meter = screen.getByRole("meter", { name: /Confiance moyenne/ });
    expect(meter).toHaveAttribute("aria-valuenow", "3");
    expect(meter).toHaveAttribute("aria-valuemax", "4");
  });

  it("explique toujours ce que signifie le niveau", () => {
    render(<ConfidenceMeter level="INSUFFICIENT" />);
    expect(screen.getByText(/ne formule pas de recommandation/)).toBeInTheDocument();
  });

  it("affiche le score en pourcentage quand il est fourni", () => {
    render(<ConfidenceMeter level="HIGH" score={0.925} />);
    expect(screen.getByText("93 %")).toBeInTheDocument();
  });
});
