import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParcelCropOverview } from "@/modules/satellite";
import { ParcelCropAreaSection, ParcelCropSection } from "./parcel-crop-section";

// Cultures mesurées par parcelle, telles que le ministère les lit (ADR-0032).

const PARCEL_ID = "019284a0-0000-7000-8000-00000000c001";

const overview: ParcelCropOverview = {
  campaignCode: "2026-2027",
  model: {
    version: 8,
    trainedAt: new Date("2026-09-27T02:00:00Z"),
    trainingParcels: 654,
    fieldVisitLabels: 12,
    synthetic: false,
  },
  accuracy: {
    judged: 654,
    correct: 566,
    accuracy: 566 / 654,
    interval: { low: 0.837, high: 0.89 },
    classes: [
      {
        group: "MAIZE",
        parcels: 300,
        correct: 270,
        recall: 0.9,
        precision: 0.88,
        mainConfusion: { predicted: "SORGHUM_MILLET", share: 0.07 },
      },
    ],
    rows: [{ reference: "MAIZE", counts: { MAIZE: 270, SORGHUM_MILLET: 21, COTTON: 9 } }],
    columns: ["MAIZE", "SORGHUM_MILLET", "COTTON"],
    folds: 5,
    confident: { judged: 522, share: 0.8, accuracy: 0.908 },
    communes: [{ code: "BJ-ATA-008", name: "Tanguiéta", judged: 166, accuracy: 0.807 }],
  },
  agreement: {
    parcels: 1377,
    agrees: 1198,
    differs: 41,
    uncertain: 138,
    byCrop: [
      { group: "MAIZE", parcels: 600, agrees: 540, differs: 20, uncertain: 40, agreementRate: 0.9 },
    ],
  },
  disagreements: [
    {
      parcelId: PARCEL_ID,
      parcelCode: "PAR-000123",
      communeName: "Tchaourou",
      measuredGroup: "COTTON",
      declaredGroup: "MAIZE",
      confidence: 0.92,
    },
  ],
  areas: {
    byCrop: [
      {
        group: "MAIZE",
        classifiedParcels: 610,
        classifiedHa: 1220,
        weightedHa: 1180.5,
        declaredHa: 1300,
      },
    ],
    byCommune: [
      {
        communeCode: "BJ-BOR-008",
        communeName: "Tchaourou",
        cropClass: "ANNUAL",
        measuredHa: 900,
        mapHa: 12_000,
        share: 0.075,
      },
      {
        communeCode: "BJ-BOR-008",
        communeName: "Tchaourou",
        cropClass: "RICE",
        measuredHa: 12,
        mapHa: null,
        share: null,
      },
    ],
  },
};

describe("cultures mesurées par parcelle", () => {
  it("affiche la précision sur une commune nouvelle, avec sa marge", () => {
    render(<ParcelCropSection overview={overview} />);
    expect(screen.getByText("87 %")).toBeInTheDocument();
    expect(screen.getByText(/Validation par commune, marge 84\s%\sà 89\s%/)).toBeInTheDocument();
    expect(screen.getByText("Sorgho ou mil (7 %)")).toBeInTheDocument();
    expect(screen.getByText("Tanguiéta")).toBeInTheDocument();
  });

  it("ouvre chaque désaccord sur la carte, sans nommer de producteur", () => {
    render(<ParcelCropSection overview={overview} />);
    const link = screen.getByRole("link", { name: "PAR-000123" });
    expect(link).toHaveAttribute("href", `/carte?parcelle=${PARCEL_ID}`);
    const row = link.closest("tr")!;
    expect(within(row).getByText("Coton")).toBeInTheDocument();
    expect(within(row).getByText("92 %")).toBeInTheDocument();
    expect(screen.getByText(/1 plus sûrs sur 41/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });

  it("dit quand la précision n'est pas encore calculée", () => {
    render(<ParcelCropSection overview={{ ...overview, accuracy: null }} />);
    expect(screen.getByText("Pas encore")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /culture mesurée en colonnes/ })).toBeNull();
  });

  it("met les surfaces pondérées face à la carte des pixels", () => {
    render(<ParcelCropAreaSection overview={overview} />);
    expect(screen.getByText(/1\s181/)).toBeInTheDocument();
    expect(screen.getByText("8 %")).toBeInTheDocument();
    expect(screen.getByText("Non mesurée")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });
});
