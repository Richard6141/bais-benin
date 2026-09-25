import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AlertCard, formatPeriod, type AlertCardData } from "./alert-card";

const alert: AlertCardData = {
  title: "Stress hydrique sur les semis de maïs",
  communeName: "Djougou",
  severity: "WARNING",
  category: "WATER_STRESS",
  message: "3 mm de pluie en 10 jours et 37 °C prévus jeudi.",
  advice: "Différez les semis et paillez les jeunes plants.",
  startsOn: "2026-09-20",
  endsOn: "2026-09-27",
  farmCount: 412,
  hectares: 830,
  source: "Open-Meteo, moteur de règles BAIS",
  sourceDate: "24 sept. 2026",
  readAt: null,
};

describe("AlertCard", () => {
  it("formate la période en français", () => {
    expect(formatPeriod("2026-09-20", "2026-09-27")).toBe("Du 20 septembre au 27 septembre");
    expect(formatPeriod("2026-09-20")).toBe("Depuis le 20 septembre");
  });

  it("affiche sévérité, catégorie, conseil, portée et provenance en variante pleine", () => {
    render(<AlertCard alert={alert} />);
    expect(screen.getByText("Alerte")).toBeInTheDocument();
    expect(screen.getByText("Stress hydrique")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: alert.title })).toBeInTheDocument();
    expect(screen.getByText("Que faire ?")).toBeInTheDocument();
    expect(screen.getByText(alert.advice!)).toBeInTheDocument();
    expect(screen.getByText(/412 exploitations, 830 ha concernés/)).toBeInTheDocument();
    expect(screen.getByText(/Source : Open-Meteo/)).toBeInTheDocument();
  });

  it("masque message et conseil en variante compacte", () => {
    render(<AlertCard alert={alert} variant="compact" />);
    expect(screen.queryByText("Que faire ?")).not.toBeInTheDocument();
    expect(screen.queryByText(alert.message)).not.toBeInTheDocument();
  });

  it("marque l'alerte comme lue puis affiche la date de lecture", () => {
    const onMarkRead = vi.fn();
    const { rerender } = render(
      <AlertCard alert={alert} variant="farmer" onMarkRead={onMarkRead} />,
    );
    const button = screen.getByRole("button", { name: "J'ai lu" });
    expect(button.className).toContain("h-14");
    fireEvent.click(button);
    expect(onMarkRead).toHaveBeenCalledTimes(1);

    rerender(
      <AlertCard alert={{ ...alert, readAt: "2026-09-24T08:00:00Z" }} onMarkRead={onMarkRead} />,
    );
    expect(screen.queryByRole("button", { name: "J'ai lu" })).not.toBeInTheDocument();
    expect(screen.getByText("Lu le 24 septembre")).toBeInTheDocument();
  });
});
