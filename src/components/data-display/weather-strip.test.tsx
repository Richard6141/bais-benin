import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeatherStrip, weatherKind, type WeatherDay } from "./weather-strip";

const days: WeatherDay[] = [
  { date: "2026-09-22", tMaxC: 33, tMinC: 22, rainMm: 14, forecast: false },
  { date: "2026-09-23", tMaxC: 34, tMinC: 23, rainMm: 3, forecast: false },
  { date: "2026-09-24", tMaxC: 37, tMinC: 24, rainMm: 0, forecast: true },
  { date: "2026-09-25", tMaxC: 35, tMinC: 23, rainMm: 0.2, forecast: true },
];

describe("WeatherStrip", () => {
  it("dérive le pictogramme des seuils de pluie et de chaleur", () => {
    expect(weatherKind(days[0]!).kind).toBe("HEAVY_RAIN");
    expect(weatherKind(days[1]!).kind).toBe("RAIN");
    expect(weatherKind(days[2]!).kind).toBe("HEAT");
    expect(weatherKind(days[3]!).kind).toBe("DRY");
  });

  it("sépare les jours observés des jours prévus et cite la source", () => {
    const { container } = render(
      <WeatherStrip days={days} source="Open-Meteo" sourceDate="24 sept. 2026" />,
    );
    expect(screen.getAllByText("Prévision")).toHaveLength(1);
    expect(container.querySelectorAll('[data-forecast="true"]')).toHaveLength(2);
    expect(screen.getByText("Forte chaleur")).toBeInTheDocument();
    expect(screen.getByText("37 °C")).toBeInTheDocument();
    expect(screen.getByText("14 mm")).toBeInTheDocument();
    expect(screen.getByText(/Source : Open-Meteo/)).toBeInTheDocument();
  });

  it("fait du conteneur défilant le bloc conteneur des libellés masqués", () => {
    // Régression mobile : sans position relative, les libellés sr-only élargissaient la page.
    render(<WeatherStrip days={days} source="Open-Meteo" />);
    const scroller = screen.getByRole("list", { name: "Météo jour par jour" }).parentElement;
    expect(scroller).toHaveClass("relative", "overflow-x-auto");
  });

  it("affiche un état vide sans données", () => {
    render(<WeatherStrip days={[]} source="Open-Meteo" />);
    expect(screen.getByText("Pas de données météo")).toBeInTheDocument();
  });
});
