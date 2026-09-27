import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapLayersSheet } from "./map-layers-sheet";

describe("feuille Couches et filtres (mobile et tablette)", () => {
  it("borne la feuille à l'écran et fait défiler son contenu plutôt que de le couper", () => {
    render(
      <MapLayersSheet activeCount={0}>
        <p>Fond de carte</p>
        <p>Feux actifs</p>
      </MapLayersSheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Couches/ }));
    const body = screen.getByText("Fond de carte").parentElement;
    expect(body?.className).toContain("overflow-y-auto");
    // Sans min-h-0, un enfant flexible ne se réduit jamais sous sa taille de contenu et pousse la
    // feuille au-delà de max-h au lieu de défiler dedans : le bug rapporté sur mobile.
    expect(body?.className).toContain("min-h-0");
    expect(body?.className).toContain("flex-1");
  });
});
