import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FirePreventionStatus } from "@/modules/fires";
import { FirePreventionPanel } from "./prevention-status";

// Encart « Prévention de la saison des feux » du centre de veille (ADR-0038, ADR-0039) : état de
// l'interrupteur, saison de référence et celle qui manque, communes retenues.

function status(overrides: Partial<FirePreventionStatus> = {}): FirePreventionStatus {
  return {
    enabled: false,
    inSeason: true,
    reference: {
      kind: "latest-complete-season",
      startYear: 2023,
      label: "saison 2023-2024",
      missingLabel: "saison 2025-2026",
      from: new Date("2023-10-31T23:00:00Z"),
      to: new Date("2024-04-30T23:00:00Z"),
    },
    communes: Array.from({ length: 8 }, (_, index) => ({
      id: `c${index}`,
      name: `Commune ${index + 1}`,
      density: 120 - index * 10,
    })),
    ...overrides,
  };
}

describe("prévention de la saison des feux, vue du ministère", () => {
  it("dit la saison de référence et celle qui manque", () => {
    render(<FirePreventionPanel status={status()} />);
    const panel = screen.getByRole("region", { name: "Prévention de la saison des feux" });
    expect(panel).toHaveTextContent("Référence : saison 2023-2024");
    expect(panel).toHaveTextContent("(saison 2025-2026 pas encore en base)");
    expect(panel).toHaveTextContent("Coupée");
    expect(panel).toHaveTextContent(
      "8 communes retenues : Commune 1, Commune 2, Commune 3, Commune 4, Commune 5, Commune 6 et 2 autres.",
    );
    expect(panel).toHaveTextContent("La plus touchée : Commune 1, 120 feux pour 100 km².");
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });

  it("dit quand la saison passée est là, active, et quand aucune commune n'est retenue", () => {
    render(
      <FirePreventionPanel
        status={status({
          enabled: true,
          reference: {
            kind: "previous-season",
            startYear: 2025,
            label: "saison 2025-2026",
            missingLabel: null,
            from: new Date("2025-10-31T23:00:00Z"),
            to: new Date("2026-04-30T23:00:00Z"),
          },
          communes: [],
        })}
      />,
    );
    const panel = screen.getByRole("region", { name: "Prévention de la saison des feux" });
    expect(panel).toHaveTextContent("Active");
    expect(panel).not.toHaveTextContent("pas encore en base");
    expect(panel).toHaveTextContent("Aucune commune retenue sur cette saison.");
  });
});
