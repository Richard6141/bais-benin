import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImageryCatalog } from "@/modules/satellite";
import { SkyLegend } from "./map-legend";
import { SkyControl } from "./sky-control";

function catalog(imageryAvailable: boolean): ImageryCatalog {
  return {
    imageryAvailable,
    attribution: "Contains modified Copernicus Sentinel data",
    defaultPeriod: "2026-05",
    checkedAt: "2026-09-26T08:00:00.000Z",
    periods: [
      {
        period: "2026-09",
        label: "septembre 2026",
        current: true,
        clearSceneCount: 45,
        clearest: null,
        lastAcquiredAt: null,
      },
      {
        period: "2026-05",
        label: "mai 2026",
        current: false,
        clearSceneCount: 255,
        clearest: null,
        lastAcquiredAt: null,
      },
    ],
  };
}

describe("choix du fond de carte", () => {
  it("annonce la mise en service tant que le compte Copernicus n'est pas configuré", () => {
    render(
      <SkyControl
        catalog={{ status: "ready", catalog: catalog(false) }}
        layer={null}
        period={null}
        onLayerChange={vi.fn()}
        onPeriodChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Fond de carte")).toHaveTextContent("Carte des communes");
    expect(screen.getByText("Images satellite en cours de mise en service.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mois")).not.toBeInTheDocument();
  });

  it("propose le mois une fois la vue du ciel choisie", () => {
    render(
      <SkyControl
        catalog={{ status: "ready", catalog: catalog(true) }}
        layer="ndvi"
        period="2026-05"
        onLayerChange={vi.fn()}
        onPeriodChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Fond de carte")).toHaveTextContent("Végétation (NDVI)");
    expect(screen.getByLabelText("Mois")).toHaveTextContent("mai 2026 — 255 scènes dégagées");
    expect(screen.queryByText(/mise en service/)).not.toBeInTheDocument();
  });

  it("signale un catalogue injoignable sans bloquer la carte des communes", () => {
    render(
      <SkyControl
        catalog={{ status: "error" }}
        layer={null}
        period={null}
        onLayerChange={vi.fn()}
        onPeriodChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Catalogue satellite momentanément injoignable.")).toBeInTheDocument();
  });
});

describe("légende de la vue du ciel", () => {
  it("donne les classes du NDVI avec leurs repères, la source et la mention Copernicus", () => {
    render(<SkyLegend view={{ layer: "ndvi", period: "2026-05" }} periodLabel="mai 2026" detail />);
    const classes = screen.getAllByRole("listitem");
    expect(classes).toHaveLength(8);
    expect(classes[0]).toHaveTextContent("≥ 0,7 · couvert dense");
    expect(classes[7]).toHaveTextContent("< 0,1 · sol nu, eau, bâti");
    expect(screen.getByText("Sentinel-2, mai 2026 · détail en zoomant")).toBeInTheDocument();
    expect(screen.getByText("Contains modified Copernicus Sentinel data 2026")).toBeInTheDocument();
  });

  it("invite à se connecter pour l'image détaillée", () => {
    render(
      <SkyLegend
        view={{ layer: "couleur-naturelle", period: "2026-05" }}
        periodLabel="mai 2026"
        detail={false}
      />,
    );
    expect(screen.getByText("Image en couleur naturelle")).toBeInTheDocument();
    expect(
      screen.getByText("Sentinel-2, mai 2026 · connectez-vous pour le détail"),
    ).toBeInTheDocument();
  });
});
