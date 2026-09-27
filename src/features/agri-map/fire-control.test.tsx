import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FireLegend } from "./fire-control";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

describe("légende des feux actifs", () => {
  it("donne le total sur 7 jours quand les dernières 24 heures sont vides", () => {
    render(<FireLegend window="24h" data={EMPTY} sevenDayCount={5} />);
    expect(
      screen.getByText("Aucun feu détecté ces dernières 24 heures. 5 sur 7 jours."),
    ).toBeInTheDocument();
  });

  it("reste sobre tant que le total sur 7 jours n'est pas encore chargé", () => {
    render(<FireLegend window="24h" data={EMPTY} />);
    expect(screen.getByText("Aucun feu détecté ces dernières 24 heures.")).toBeInTheDocument();
  });

  it("ne redemande rien de plus large pour une fenêtre de 7 jours déjà vide", () => {
    render(<FireLegend window="7j" data={EMPTY} />);
    expect(screen.getByText("Aucun feu détecté ces 7 derniers jours.")).toBeInTheDocument();
  });

  it("compte les feux quand la couche en porte", () => {
    render(
      <FireLegend
        window="24h"
        data={{
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [1.6, 9.7] },
              properties: {},
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("1 feu détecté au Bénin.")).toBeInTheDocument();
  });
});
