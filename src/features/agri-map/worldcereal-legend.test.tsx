import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CROP_MAP_QUARTERS, WORLDCEREAL_QUARTERS } from "./map-config";
import { WorldCerealLegend } from "./worldcereal-legend";

// Terres cultivées 2021 (ESA WorldCereal) : attribution, année et mise en garde toujours visibles,
// images posées exactement sur les quarts de la carte des cultures pour comparer.

describe("terres cultivées 2021", () => {
  it("dit la source, la licence et l'année, et que ce n'est pas la campagne en cours", () => {
    render(<WorldCerealLegend />);
    expect(screen.getByText("Terres cultivées 2021")).toBeInTheDocument();
    expect(screen.getByText(/ESA WorldCereal 2021, CC BY 4\.0/)).toBeInTheDocument();
    expect(screen.getByText("Carte de 2021, pas la campagne en cours")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[·…—]/);
  });

  it("sert quatre images statiques sur les quarts de la carte des cultures", () => {
    expect(WORLDCEREAL_QUARTERS).toHaveLength(4);
    WORLDCEREAL_QUARTERS.forEach((quarter, index) => {
      expect(quarter.url).toBe(`/cartes/worldcereal-2021/q${index}.png`);
      expect(quarter.coordinates).toEqual(CROP_MAP_QUARTERS[index]!.coordinates);
    });
  });
});
