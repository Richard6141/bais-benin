import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DamageRow } from "@/modules/fires";
import { DamageList } from "./damage-list";
import type { Route } from "next";

// Liste des déclarations de sinistre (ADR-0038 §2) : ce que disent le satellite et l'agent, et
// l'état de chaque déclaration.

function row(overrides: Partial<DamageRow>): DamageRow {
  return {
    id: "019284a0-0000-7000-8000-00000000d001",
    status: "PROPOSED",
    occurredAt: new Date("2026-12-10T13:30:00Z"),
    estimatedLowHa: 0.6 as unknown as DamageRow["estimatedLowHa"],
    estimatedHighHa: 0.9 as unknown as DamageRow["estimatedHighHa"],
    observedAreaHa: null,
    cropStage: null,
    note: null,
    rejectReason: null,
    reviewedAt: null,
    version: 1,
    createdAt: new Date("2026-12-25T13:30:00Z"),
    crop: null,
    parcel: { code: "P-001" },
    farm: {
      id: "019284a0-0000-7000-8000-00000000f001",
      code: "EXP-001",
      name: "Champ de Koffi",
      commune: { name: "Tchaourou" },
      farmer: { firstName: "Koffi", lastName: "Adjovi" },
    },
    burnAssessment: {
      fireDistanceM: 240,
      validShare: 0.9 as unknown as DamageRow["burnAssessment"]["validShare"],
      reliability: "ESTIMATED",
      trigger: "ALERT",
    },
    ...overrides,
  };
}

describe("déclarations de sinistre", () => {
  it("dit l'estimation satellite, puis le constat de l'agent", () => {
    render(
      <DamageList
        rows={[
          row({}),
          row({
            id: "019284a0-0000-7000-8000-00000000d002",
            status: "CONFIRMED",
            observedAreaHa: 0.75 as unknown as DamageRow["observedAreaHa"],
            crop: { code: "MAIZE", nameFr: "Maïs" },
            cropStage: "GROWING",
          }),
          row({
            id: "019284a0-0000-7000-8000-00000000d003",
            status: "REJECTED",
            rejectReason: "Brûlis volontaire du producteur",
            burnAssessment: { ...row({}).burnAssessment, reliability: "SYNTHETIC" },
          }),
        ]}
        hrefOf={(item) => `/agent/sinistres/${item.id}` as Route}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("À confirmer")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(
      "Estimation satellite : 0,6 à 0,9 ha brûlés, à confirmer sur place.",
    );
    expect(items[0]).toHaveTextContent("parcelle P-001, Tchaourou");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/agent/sinistres/019284a0-0000-7000-8000-00000000d001",
    );
    expect(items[1]).toHaveTextContent("Constaté : 0,75 ha brûlés, Maïs en croissance.");
    expect(within(items[2]!).getByText("Écartée")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Démonstration")).toBeInTheDocument();
    expect(items[2]).toHaveTextContent("Écartée : Brûlis volontaire du producteur.");
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });
});
