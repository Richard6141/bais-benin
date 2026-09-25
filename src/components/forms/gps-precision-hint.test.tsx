import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GpsPrecisionHint, describeAccuracy } from "./gps-precision-hint";

describe("GpsPrecisionHint", () => {
  it("qualifie la précision selon les seuils de 10 et 30 mètres", () => {
    expect(describeAccuracy(4).level).toBe("GOOD");
    expect(describeAccuracy(10).level).toBe("GOOD");
    expect(describeAccuracy(10.5).level).toBe("MEDIUM");
    expect(describeAccuracy(30).level).toBe("MEDIUM");
    expect(describeAccuracy(31).level).toBe("LOW");
  });

  it("annonce une bonne précision avec la valeur en mètres", () => {
    render(<GpsPrecisionHint accuracyM={6.4} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("data-precision", "GOOD");
    expect(status).toHaveTextContent("± 6 m");
    expect(status).toHaveTextContent("Précision bonne");
  });

  it("invite à sortir à découvert quand la précision est faible", () => {
    render(<GpsPrecisionHint accuracyM={85} />);
    expect(screen.getByRole("status")).toHaveTextContent("Précision faible, sortez à découvert");
  });

  it("indique une précision inconnue sans valeur", () => {
    render(<GpsPrecisionHint accuracyM={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Précision GPS inconnue");
  });
});
