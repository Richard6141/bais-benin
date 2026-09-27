import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FarmFireAlert } from "@/modules/fires/farm-alert";

vi.mock("./fire-mini-map", () => ({
  FireMiniMap: () => <div data-testid="mini-map" />,
}));

const { FireAlertCard } = await import("./fire-alert-card");

const SITUATION =
  "Un feu est détecté à environ 300 m au nord-est de votre champ de maïs, au passage du satellite aujourd'hui à 10 h 30. Détecté par satellite, à vérifier sur place : ce peut être un brûlage contrôlé.";

const ALERT: FarmFireAlert = {
  alertId: "0199a000-0000-7000-8000-000000000001",
  severity: "CRITICAL",
  situation: SITUATION,
  adviceFr: "Éloignez le bétail et surveillez le vent, un agent passera si besoin.",
  detectedAt: "2026-09-27T09:30:00.000Z",
  distanceM: 320,
  fire: { lng: 1.6714, lat: 9.7014 },
  farm: { lng: 1.67, lat: 9.7 },
};

describe("carte d'alerte feu de l'accueil agriculteur", () => {
  it("dit où est le feu depuis SA parcelle, le conseil et le lien vers l'alerte", async () => {
    const { container } = render(<FireAlertCard alert={ALERT} />);
    expect(screen.getByText("Feu détecté près de votre champ")).toBeInTheDocument();
    expect(screen.getByText(SITUATION)).toBeInTheDocument();
    expect(screen.getByText("Alerte grave")).toBeInTheDocument();
    expect(
      screen.getByText("Éloignez le bétail et surveillez le vent, un agent passera si besoin."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir l'alerte" })).toHaveAttribute(
      "href",
      "/agriculteur/alertes/0199a000-0000-7000-8000-000000000001",
    );
    expect(await screen.findByTestId("mini-map")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/·|…|—/);
  });
});
