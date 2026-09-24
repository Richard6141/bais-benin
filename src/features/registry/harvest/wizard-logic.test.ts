import { describe, expect, it } from "vitest";

import {
  buildSummary,
  initialSeason,
  initialStep,
  lossesPctFor,
  nextStep,
  parseQuantity,
  previousStep,
  unitLabel,
  visibleSteps,
  type WizardSeason,
} from "./wizard-logic";

const maize: WizardSeason = {
  parcelCropId: "pc-1",
  parcelCode: "BJ-DON-DJO-100001-P01",
  cropCode: "MAIZE",
  cropName: "Maïs",
  campaignCode: "2026-2027",
  tradeUnit: "BAG_100KG",
  expectedHarvestOn: "2026-09-01T00:00:00.000Z",
};
const yam: WizardSeason = {
  ...maize,
  parcelCropId: "pc-2",
  cropCode: "YAM",
  cropName: "Igname",
  parcelCode: "BJ-DON-DJO-100001-P02",
};

describe("ordre des écrans", () => {
  it("saute le choix de culture quand une seule est déclarée", () => {
    expect(initialStep([maize])).toBe("QUANTITY");
    expect(initialSeason([maize])).toEqual(maize);
    expect(visibleSteps([maize])).toEqual(["QUANTITY", "LOSSES"]);
  });

  it("commence par le choix de culture quand il y en a plusieurs ou aucune", () => {
    expect(initialStep([maize, yam])).toBe("CROP");
    expect(initialSeason([maize, yam])).toBeNull();
    expect(initialStep([])).toBe("CROP");
    expect(visibleSteps([maize, yam])).toEqual(["CROP", "QUANTITY", "LOSSES"]);
  });

  it("avance et recule sans jamais revenir sur un écran sauté", () => {
    expect(nextStep("CROP")).toBe("QUANTITY");
    expect(nextStep("QUANTITY")).toBe("LOSSES");
    expect(nextStep("LOSSES")).toBe("DONE");
    expect(previousStep("LOSSES", [maize])).toBe("QUANTITY");
    expect(previousStep("QUANTITY", [maize])).toBe("QUANTITY");
    expect(previousStep("QUANTITY", [maize, yam])).toBe("CROP");
  });
});

describe("pertes et unités", () => {
  it("traduit les trois niveaux de pertes en pourcentage indicatif", () => {
    expect(lossesPctFor("NONE")).toBe(0);
    expect(lossesPctFor("SOME")).toBe(10);
    expect(lossesPctFor("MUCH")).toBe(40);
    expect(lossesPctFor(null)).toBeUndefined();
  });

  it("accorde le libellé d'unité au nombre", () => {
    expect(unitLabel("sac de 100 kg", 8)).toBe("sacs de 100 kg");
    expect(unitLabel("sac de 100 kg", 1)).toBe("sac de 100 kg");
    expect(unitLabel("tas", 3)).toBe("tas");
    expect(unitLabel("régime", 2)).toBe("régimes");
  });

  it("lit une quantité avec virgule ou point", () => {
    expect(parseQuantity("12")).toBe(12);
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity(" 3.25 ")).toBe(3.25);
    expect(Number.isNaN(parseQuantity(""))).toBe(true);
    expect(Number.isNaN(parseQuantity("abc"))).toBe(true);
  });
});

describe("résumé", () => {
  it("compose la phrase de confirmation avec la parcelle seulement s'il y en a plusieurs", () => {
    expect(
      buildSummary({
        cropName: "Maïs",
        amount: 8,
        unitLabelSingular: "sac de 100 kg",
        parcelCode: "BJ-DON-DJO-100001-P01",
        campaignCode: "2026-2027",
        parcelCount: 2,
      }),
    ).toBe("Maïs, 8 sacs de 100 kg, parcelle P01, campagne 2026-2027.");
    expect(
      buildSummary({
        cropName: "Igname",
        amount: 1,
        unitLabelSingular: "tas",
        parcelCode: "BJ-DON-DJO-100001-P01",
        campaignCode: "2026-2027",
        parcelCount: 1,
      }),
    ).toBe("Igname, 1 tas, campagne 2026-2027.");
  });
});
