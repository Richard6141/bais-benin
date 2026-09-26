import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParcelPanel } from "./parcel-panel";

const PARCEL = {
  id: "0199a000-0000-7000-8000-000000000001",
  code: "BJ-DON-003-000042-P1",
  declaredAreaHa: 2,
  computedAreaHa: 1.84,
  captureMethod: "GPS_WALK",
  irrigation: "NONE",
  centroid: { lng: 1.67, lat: 9.7 },
  bbox: [1.669, 9.699, 1.671, 9.701],
  farm: {
    id: "0199a000-0000-7000-8000-000000000002",
    code: "BJ-DON-003-000042",
    name: null,
    village: "Kolokondé",
    communeName: "Djougou",
    departementName: "Donga",
    verificationStatus: "FIELD_VERIFIED",
    parcelCount: 2,
  },
  farmer: { code: "PRD-000042", displayName: "Awa Bio", phone: null },
  crops: [
    {
      cropCode: "MAIZE",
      cropName: "Maïs",
      colorHex: "#c99a2e",
      campaignCode: "2026-2027",
      campaignOpen: true,
      subSeason: "MAIN_RAINY",
      areaHa: 1.8,
      stage: "GROWING",
      sowingDate: "2026-06-02",
      harvestKg: null,
      yieldTPerHa: null,
      communeMedianTPerHa: null,
      peers: 0,
      betterThanShare: null,
    },
    {
      cropCode: "MAIZE",
      cropName: "Maïs",
      colorHex: "#c99a2e",
      campaignCode: "2025-2026",
      campaignOpen: false,
      subSeason: "MAIN_RAINY",
      areaHa: 1.8,
      stage: "HARVESTED",
      sowingDate: null,
      harvestKg: 3600,
      yieldTPerHa: 2,
      communeMedianTPerHa: 1.4,
      peers: 38,
      betterThanShare: 0.82,
    },
  ],
  vegetation: {
    status: "TO_VERIFY",
    reason: "LOW_PEAK",
    cropName: "Maïs",
    campaignCode: "2026-2027",
    peakNdvi: 0.31,
    expectedNdvi: 0.45,
    sensor: "S2",
    sourceId: "BAIS_SEED",
    computedAt: "2026-09-20T08:00:00.000Z",
    series: [
      { from: "2026-06-01", to: "2026-06-10", ndvi: 0.2 },
      { from: "2026-06-11", to: "2026-06-20", ndvi: null },
      { from: "2026-06-21", to: "2026-06-30", ndvi: 0.31 },
    ],
  },
  overlaps: [],
  reports: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fiche parcelle de la carte", () => {
  it("présente le producteur, le rendement comparé et le verdict satellite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(PARCEL), { status: 200 })),
    );
    const onLoaded = vi.fn();
    const { container } = render(
      <ParcelPanel parcelId={PARCEL.id} onClose={() => {}} onLoaded={onLoaded} />,
    );
    expect(await screen.findByText("Awa Bio")).toBeInTheDocument();
    expect(screen.getByText("BJ-DON-003-000042-P1")).toBeInTheDocument();
    expect(screen.getByText(/Mieux que 82/)).toBeInTheDocument();
    expect(screen.getByText("À vérifier sur le terrain")).toBeInTheDocument();
    expect(onLoaded).toHaveBeenCalledWith(PARCEL.bbox);
    // Consigne de mise en forme : ni point médian ni points de suspension dans le texte visible.
    expect(container.textContent).not.toMatch(/·|…/);
  });

  it("dit simplement qu'une parcelle hors périmètre n'est pas accessible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    render(<ParcelPanel parcelId={PARCEL.id} onClose={() => {}} />);
    expect(
      await screen.findByText("Cette parcelle n'est pas dans votre périmètre."),
    ).toBeInTheDocument();
  });
});
