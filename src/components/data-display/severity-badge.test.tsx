import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SEVERITY_LABELS, SeverityBadge, type AlertSeverity } from "./severity-badge";

describe("SeverityBadge", () => {
  it.each([
    ["INFO", "Information"],
    ["WATCH", "Vigilance"],
    ["WARNING", "Alerte"],
    ["CRITICAL", "Alerte grave"],
  ] as const)("affiche %s en toutes lettres avec une icône", (severity, label) => {
    const { container } = render(<SeverityBadge severity={severity as AlertSeverity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`[data-severity="${severity}"] svg`)).not.toBeNull();
    expect(SEVERITY_LABELS[severity]).toBe(label);
  });
});
