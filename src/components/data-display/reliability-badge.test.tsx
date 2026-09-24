import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReliabilityBadge, reliabilityLabels, type Reliability } from "./reliability-badge";

const levels = Object.keys(reliabilityLabels) as Reliability[];

describe("ReliabilityBadge", () => {
  it.each(levels)("affiche le libellé français du niveau %s", (level) => {
    render(<ReliabilityBadge level={level} />);
    expect(screen.getByText(reliabilityLabels[level])).toBeInTheDocument();
  });

  it("reste accessible sans libellé visible", () => {
    render(<ReliabilityBadge level="DECLARED" showLabel={false} />);
    expect(screen.getByLabelText("Déclaré")).toHaveAttribute("data-reliability", "DECLARED");
  });
});
