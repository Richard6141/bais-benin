import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RainChart, describeRain, type RainDay } from "./rain-chart";

const days: RainDay[] = [
  { date: "2026-09-20", rainMm: 12 },
  { date: "2026-09-21", rainMm: 0 },
  { date: "2026-09-22", rainMm: 0.4 },
  { date: "2026-09-23", rainMm: 5.5 },
  { date: "2026-09-24", rainMm: 8, forecast: true },
];

describe("RainChart", () => {
  it("résume le total observé, les jours secs et la prévision", () => {
    expect(describeRain(days)).toBe(
      "Cumul de pluie sur 4 jours : 17,9 mm, 2 jours secs. Prévision sur 1 jours : 8 mm.",
    );
  });

  it("rend une image SVG nommée par ce résumé, avec jours prévus hachurés et seuil", () => {
    const { container } = render(<RainChart days={days} thresholdMm={10} source="Open-Meteo" />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("aria-label", describeRain(days));
    expect(container.querySelectorAll("rect[data-forecast]")).toHaveLength(5);
    expect(container.querySelector('rect[data-forecast="true"]')).toHaveAttribute(
      "fill",
      "url(#rain-forecast)",
    );
    expect(screen.getByText("Seuil 10 mm")).toBeInTheDocument();
    expect(container.querySelector("line[stroke-dasharray]")).not.toBeNull();
  });
});
