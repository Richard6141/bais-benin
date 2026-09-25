import { describe, expect, it } from "vitest";

import {
  cropStageLabel,
  formatHarvestOf,
  formatHarvestQuantity,
  subSeasonLabel,
  unitLabelFor,
} from "./format";

describe("unités de récolte", () => {
  it("accorde chaque unité au singulier et au pluriel", () => {
    expect(unitLabelFor("BAG_100KG", 1)).toBe("sac de 100 kg");
    expect(unitLabelFor("BAG_100KG", 8)).toBe("sacs de 100 kg");
    expect(unitLabelFor("BAG_50KG", 2)).toBe("sacs de 50 kg");
    expect(unitLabelFor("BASIN", 1)).toBe("bassine");
    expect(unitLabelFor("BASIN", 3)).toBe("bassines");
    expect(unitLabelFor("HEAP", 1)).toBe("tas");
    expect(unitLabelFor("HEAP", 4)).toBe("tas");
    expect(unitLabelFor("BUNCH", 1)).toBe("régime");
    expect(unitLabelFor("BUNCH", 6)).toBe("régimes");
    expect(unitLabelFor("KG", 1)).toBe("kilogramme");
    expect(unitLabelFor("KG", 250)).toBe("kilogrammes");
    expect(unitLabelFor("T", 1)).toBe("tonne");
    expect(unitLabelFor("T", 2.5)).toBe("tonnes");
  });

  it("garde le singulier sous 2 et reste lisible pour un code inconnu", () => {
    expect(unitLabelFor("BAG_100KG", 0.5)).toBe("sac de 100 kg");
    expect(unitLabelFor("BAG_100KG", 1.5)).toBe("sacs de 100 kg");
    expect(unitLabelFor("CAN_25L", 2)).toBe("cans 25l");
  });

  it("formate la quantité en français avec son unité", () => {
    expect(formatHarvestQuantity(8, "BAG_100KG")).toBe("8 sacs de 100 kg");
    expect(formatHarvestQuantity(1, "BASIN")).toBe("1 bassine");
    expect(formatHarvestQuantity(2.5, "T")).toBe("2,5 tonnes");
    expect(formatHarvestQuantity(1200, "KG")).toMatch(/^1\s200 kilogrammes$/);
  });

  it("compose « quantité de culture » avec élision devant voyelle", () => {
    expect(formatHarvestOf(8, "BAG_100KG", "Maïs")).toBe("8 sacs de 100 kg de maïs");
    expect(formatHarvestOf(1, "HEAP", "Igname")).toBe("1 tas d'igname");
    expect(formatHarvestOf(3, "BAG_50KG", "Arachide")).toBe("3 sacs de 50 kg d'arachide");
  });
});

describe("autres libellés", () => {
  it("traduit sous-saisons et stades", () => {
    expect(subSeasonLabel("MAIN_RAINY")).toBe("grande saison des pluies");
    expect(subSeasonLabel("DRY")).toBe("contre-saison sèche");
    expect(cropStageLabel("HARVESTED")).toBe("récoltée");
    expect(cropStageLabel("GROWING")).toBe("en croissance");
  });
});
