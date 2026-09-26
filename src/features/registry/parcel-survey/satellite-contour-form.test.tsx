import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Réseau présent, synchronisation simulée ; la carte, sans WebGL dans jsdom, laisse place à son
// avis : l'écran se teste par la liste des contours proposés.
vi.mock("@/lib/offline/use-sync", () => ({
  useSync: () => ({ online: true, sync: vi.fn() }),
}));

const { SatelliteContourForm } = await import("./satellite-contour-form");

const PROPS = {
  userId: "u1",
  farm: { id: "f1", location: null },
  parcel: {
    id: "019284a0-0000-7000-8000-00000000e001",
    code: "BJ-P-000001",
    declaredAreaHa: 2,
    version: 1,
    centroid: { lng: 1.67, lat: 9.7 },
  },
};

const RING = [
  [1.67, 9.7],
  [1.6714, 9.7],
  [1.6714, 9.7014],
  [1.67, 9.7014],
  [1.67, 9.7],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contour depuis le satellite", () => {
  it("propose des contours et recommande le plus sûr", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          point: { lon: 1.67, lat: 9.7 },
          window: { from: "2025-11-30T00:00:00Z", to: "2026-09-26T00:00:00Z" },
          sourceId: "COPERNICUS_S2",
          attribution: "Contains modified Copernicus Sentinel data",
          candidates: [
            {
              level: "TIGHT",
              areaHa: 1.8,
              confidence: 0.62,
              touchesEdge: false,
              geometry: { type: "Polygon", coordinates: [RING] },
            },
            {
              level: "MEDIUM",
              areaHa: 2.4,
              confidence: 0.81,
              touchesEdge: false,
              geometry: { type: "Polygon", coordinates: [RING] },
            },
          ],
        }),
      ),
    );
    render(<SatelliteContourForm {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Proposer un contour" }));
    expect(await screen.findByRole("radio", { name: /Moyen/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Serré/ })).not.toBeChecked();
    expect(screen.getByText(/2,4 ha · confiance 81/)).toBeInTheDocument();
    expect(screen.getByText(/Contains modified Copernicus Sentinel data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider ce contour" })).toBeEnabled();
  });

  it("dit clairement quand la part mensuelle des propositions est épuisée", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "share-exhausted",
            error:
              "La part mensuelle des propositions satellite est épuisée : relevez le contour à pied, les propositions reviennent le mois prochain",
          },
          { status: 429 },
        ),
      ),
    );
    render(<SatelliteContourForm {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Proposer un contour" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La part mensuelle des propositions satellite est épuisée",
    );
    expect(screen.getByRole("button", { name: "Valider ce contour" })).toBeDisabled();
  });
});
