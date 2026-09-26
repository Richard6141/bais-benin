import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParcelVegetationNote } from "./parcel-vegetation";
import { VegetationSection } from "./vegetation-section";

describe("verdict satellite d'une parcelle", () => {
  it("explique un écart et invite à une visite, avec la source", () => {
    render(
      <ParcelVegetationNote
        checks={[
          {
            parcelId: "p1",
            campaignCode: "2026-2027",
            subSeason: "MAIN_RAINY",
            cropName: "Maïs",
            status: "TO_VERIFY",
            reason: "LOW_PEAK",
            peakNdvi: 0.21,
            expectedNdvi: 0.45,
            sourceId: "COPERNICUS_S2",
            computedAt: new Date("2026-09-26T05:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.getByText("À vérifier sur le terrain")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Vue du satellite" })).toHaveTextContent(
      "Végétation trop faible pour la culture déclarée : NDVI observé 0,21, attendu au moins 0,45.",
    );
    expect(screen.getByText(/Contains modified Copernicus Sentinel data/)).toBeInTheDocument();
  });

  it("ne dit rien tant qu'aucune confrontation n'a eu lieu", () => {
    const { container } = render(<ParcelVegetationNote checks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("synthèse satellite du pilotage", () => {
  it("compte les verdicts et nomme la source synthétique de démonstration", () => {
    render(
      <VegetationSection
        summary={{
          campaignCode: "2026-2027",
          byStatus: [
            { status: "CONSISTENT", count: 90 },
            { status: "TO_VERIFY", count: 10 },
            { status: "PENDING", count: 40 },
          ],
          communes: [{ code: "BJ-DON-003", name: "Djougou", checked: 20, to_verify: 5 }],
          flagged: [],
          sources: [{ sourceId: "BAIS_SEED", lastComputedAt: new Date("2026-09-26T05:00:00Z") }],
        }}
      />,
    );
    expect(screen.getByText("100")).toBeInTheDocument();
    // Intl sépare le nombre du signe % par une espace fine insécable.
    expect(screen.getByText(/10\s%\sdes parcelles jugées/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Djougou");
    expect(screen.getByText(/Série NDVI synthétique de démonstration/)).toBeInTheDocument();
  });
});
