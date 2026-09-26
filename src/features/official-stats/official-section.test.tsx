import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OfficialReconciliation } from "@/modules/official-stats";
import { OfficialSection } from "./official-section";

vi.mock("./actions", () => ({ importOfficialStatisticsAction: vi.fn() }));

// Statistiques officielles telles que le ministère les lit (ADR-0034).

const empty: OfficialReconciliation = { openCampaignCode: "2026-2027", imports: [], rows: [] };

const filled: OfficialReconciliation = {
  openCampaignCode: "2026-2027",
  imports: [
    {
      sourceId: "MAEP_DSA",
      campaignCode: "2025-2026",
      rows: 4,
      lastImportedAt: new Date("2026-09-27T10:00:00Z"),
    },
  ],
  rows: [
    {
      territoryCode: "BJ-BOR-008",
      territoryName: "Tchaourou",
      level: "COMMUNE",
      cropCode: "MAIZE",
      cropName: "Maïs",
      sourceId: "MAEP_DSA",
      campaignCode: "2025-2026",
      reference: "Annuaire DSA",
      officialHa: 90_000,
      registryHa: 1_800,
      registryShare: 0.02,
      survey: {
        group: "MAIZE",
        officialGroupHa: 90_000,
        estimate: { areaHa: 85_000, marginHa: 12_000, status: "indicative" },
        withinMargin: true,
      },
      sameCampaign: false,
    },
    {
      territoryCode: "BJ",
      territoryName: "Bénin",
      level: "NATIONAL",
      cropCode: "RICE",
      cropName: "Riz",
      sourceId: "FAOSTAT",
      campaignCode: "2023",
      reference: null,
      officialHa: 120_000,
      registryHa: 300,
      registryShare: 0.0025,
      survey: null,
      sameCampaign: false,
    },
  ],
};

describe("statistiques officielles", () => {
  it("dit quelles données demander tant que rien n'est importé", () => {
    render(<OfficialSection reconciliation={empty} />);
    expect(screen.getByText("Aucune statistique officielle importée")).toBeInTheDocument();
    expect(screen.getByText(/DSA du MAEP : surfaces/)).toBeInTheDocument();
    expect(screen.getByText(/FAOSTAT \(cultures et produits animaux\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("Fichier CSV")).toBeInTheDocument();
  });

  it("met chaque surface officielle face au registre et au sondage", () => {
    render(<OfficialSection reconciliation={filled} />);
    const maize = screen.getByText("Maïs").closest("tr")!;
    expect(within(maize).getByText("DSA 2025-2026")).toBeInTheDocument();
    expect(within(maize).getByText("2 %")).toBeInTheDocument();
    expect(within(maize).getByText("Dans la marge")).toBeInTheDocument();
    const rice = screen.getByText("Riz").closest("tr")!;
    expect(within(rice).getByText("Hors enquête")).toBeInTheDocument();
    expect(within(rice).getByText("FAOSTAT 2023")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });
});
