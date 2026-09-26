import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageryCatalog } from "@/modules/satellite";
import { CropMapLegend } from "./crop-map-legend";
import { SkyControl } from "./sky-control";

// Carte des cultures (ADR-0021) : un fond de carte de plus, sans choix de mois, et une légende
// qui dit toujours qu'il s'agit d'une estimation.

const catalog: ImageryCatalog = {
  imageryAvailable: true,
  attribution: "Contains modified Copernicus Sentinel data",
  defaultPeriod: "2026-05",
  checkedAt: "2026-09-26T08:00:00.000Z",
  partial: false,
  periods: [
    {
      period: "2026-05",
      label: "mai 2026",
      current: false,
      rolling: false,
      clearSceneCount: 255,
      clearest: null,
      lastAcquiredAt: null,
    },
  ],
};

describe("carte des cultures", () => {
  it("se choisit comme fond de carte, sans mois à choisir", () => {
    render(
      <SkyControl
        catalog={{ status: "ready", catalog }}
        layer="cultures"
        period="2026-05"
        onLayerChange={vi.fn()}
        onPeriodChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Fond de carte")).toHaveTextContent("Carte des cultures");
    expect(screen.queryByLabelText("Mois")).not.toBeInTheDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("donne ses classes, l'avertissement et la mention Copernicus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200 })),
    );
    render(<CropMapLegend />);
    const classes = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(classes).toHaveLength(9);
    expect(classes[0]).toHaveTextContent("Maïs et cultures annuelles");
    expect(screen.getByText("Estimation satellite, à confirmer")).toBeInTheDocument();
    expect(screen.getByText("En cours de calibrage, à ne pas citer")).toBeInTheDocument();
    expect(
      screen.getByText(/^Contains modified Copernicus Sentinel data \d{4}-\d{4}$/),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(screen.queryByText("Carte en préparation")).not.toBeInTheDocument();
  });

  it("annonce une carte pas encore calculée", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 204 })),
    );
    render(<CropMapLegend />);
    expect(await screen.findByText("Carte en préparation")).toBeInTheDocument();
  });
});
