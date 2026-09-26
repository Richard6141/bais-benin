import { describe, expect, it } from "vitest";
import { computeCommuneBalance, statusOf, type CropInput } from "../balance";
import {
  NEEDS,
  SEVERE_THRESHOLD,
  annualStapleNeedsKcal,
  foodCropFactors,
  kcalFromProduction,
} from "../coefficients";

// Bilan alimentaire (ADR-0035) : calories d'une récolte, besoins d'une population, couverture et
// statut, vérifiés sur des cas calculés à la main.

const survey = { kind: "survey" as const, campaignCode: "2026-2027", cv: 0.08 };
const flatYield = (t: number) => ({ meanTPerHa: t, p25TPerHa: t, p75TPerHa: t, basis: "commune" });
const official = { kind: "official" as const, sourceId: "MAEP_DSA", campaignCode: "2025-2026" };

/** Culture présente avec une surface fixe (sans marge). */
function crop(cropCode: string, areaHa: number, source: CropInput["source"] = survey): CropInput {
  return {
    cropCode,
    areaHa,
    areaLowHa: areaHa,
    areaHighHa: areaHa,
    source,
    yieldRef: flatYield(1),
  };
}

describe("calories d'une récolte", () => {
  it("déduit semences et pertes du maïs, puis compte 335 kcal pour 100 g", () => {
    const maize = foodCropFactors("MAIZE")!;
    // 100 t sur 50 ha : 100 000 kg - 950 kg de semences, 25 % de pertes.
    expect(kcalFromProduction(maize, 100, 50)).toBeCloseTo((100_000 - 950) * 0.75 * 3350, 3);
  });

  it("passe le paddy en riz usiné et l'igname en partie comestible", () => {
    const rice = foodCropFactors("RICE")!;
    expect(kcalFromProduction(rice, 10, 0)).toBeCloseTo(10_000 * 0.75 * 0.67 * 0.97 * 3440, 3);
    const yam = foodCropFactors("YAM")!;
    // 3 t/ha d'igname de semence : une petite récolte ne laisse rien à manger.
    expect(kcalFromProduction(yam, 2, 1)).toBe(0);
    expect(kcalFromProduction(yam, 10, 1)).toBeCloseTo((10_000 - 2999) * 0.9 * 0.83 * 1260, 3);
  });

  it("chiffre les besoins d'une population", () => {
    expect(annualStapleNeedsKcal(1000)).toBeCloseTo(1000 * 2237 * 0.72 * 365, 3);
    expect(SEVERE_THRESHOLD).toBeCloseTo(0.7756, 4);
  });
});

describe("statut d'une commune", () => {
  it("classe la couverture selon les seuils FAO", () => {
    expect(statusOf(1.2)).toBe("covered");
    expect(statusOf(0.9)).toBe("tension");
    expect(statusOf(0.5)).toBe("deficit");
  });

  it("met à confirmer une commune dont la fourchette chevauche un seuil", () => {
    const needs = annualStapleNeedsKcal(10_000);
    const maize = foodCropFactors("MAIZE")!;
    // Surface qui couvre juste les besoins : une marge de 20 % fait changer le statut.
    const perHa = kcalFromProduction(maize, 1, 1);
    const area = needs / perHa;
    const balance = computeCommuneBalance({
      code: "BJ-X",
      name: "Commune X",
      population: 10_000,
      crops: [
        {
          cropCode: "MAIZE",
          areaHa: area,
          areaLowHa: area * 0.8,
          areaHighHa: area * 1.2,
          source: survey,
          yieldRef: flatYield(1),
        },
        // Igname et manioc vus nulle part au sondage : présents, avec une surface nulle.
        crop("YAM", 0),
        crop("CASSAVA", 0),
      ],
      missingCrops: [],
    });
    expect(balance.coverage!.central).toBeCloseTo(1, 2);
    expect(balance.toConfirm).toBe(true);
    expect(balance.crops[0]!.productionT).toBeCloseTo(area, 6);
  });

  it("n'évalue pas une commune qui n'a que son riz : le déficit serait faux", () => {
    const riceOnly = computeCommuneBalance({
      code: "BJ-R",
      name: "Commune R",
      population: 50_000,
      crops: [crop("RICE", 500, official)],
      missingCrops: ["MAIZE", "SORGHUM", "MILLET", "YAM", "CASSAVA", "SWEET_POTATO"],
    });
    expect(riceOnly.status).toBe("not-evaluated");
    expect(riceOnly.coverage).toBeNull();
    expect(riceOnly.reason).toMatch(/maïs, l'igname ou le manioc/);
  });

  it("met à confirmer un statut autre que couvert quand une culture manque", () => {
    const partial = computeCommuneBalance({
      code: "BJ-P",
      name: "Commune P",
      population: 200_000,
      crops: [
        crop("MAIZE", 1000, official),
        crop("YAM", 100, official),
        crop("CASSAVA", 100, official),
      ],
      missingCrops: ["SORGHUM"],
    });
    expect(partial.status).not.toBe("covered");
    expect(partial.toConfirm).toBe(true);
  });

  it("met à confirmer une couverture invraisemblable, au-delà de 300 %", () => {
    const huge = computeCommuneBalance({
      code: "BJ-H",
      name: "Commune H",
      population: 1000,
      crops: [crop("MAIZE", 5000), crop("YAM", 500), crop("CASSAVA", 500)],
      missingCrops: [],
    });
    expect(huge.coverage!.central).toBeGreaterThan(3);
    expect(huge.status).toBe("covered");
    expect(huge.toConfirm).toBe(true);
    expect(huge.confirmReasons.join(" ")).toMatch(/Plus de 300 % des besoins/);
  });

  it("met à confirmer une surface d'enquête imprécise, et dit pourquoi", () => {
    const loose = {
      kind: "survey" as const,
      campaignCode: "2026-2027",
      cv: 0.35,
      positives: 7,
      points: 112,
    };
    const balance = computeCommuneBalance({
      code: "BJ-L",
      name: "Commune L",
      population: 100_000,
      crops: [crop("MAIZE", 20_000, loose), crop("YAM", 2000, loose), crop("CASSAVA", 2000, loose)],
      missingCrops: [],
    });
    expect(balance.toConfirm).toBe(true);
    expect(balance.confirmReasons.join(" ")).toMatch(/à 35 % près \(7 points vivriers sur 112\)/);
  });

  it("dit pourquoi une commune d'enquête n'est pas évaluée", () => {
    const thin = computeCommuneBalance({
      code: "BJ-T",
      name: "Commune T",
      population: 100_000,
      crops: [],
      missingCrops: ["MAIZE", "YAM", "CASSAVA"],
      unavailableReason: "Enquête : 2 points vivriers sur 113, trop peu pour une surface",
    });
    expect(thin.status).toBe("not-evaluated");
    expect(thin.reason).toMatch(/2 points vivriers sur 113/);
  });

  it("n'évalue pas une commune sans surface de toute la commune ni population", () => {
    const noArea = computeCommuneBalance({
      code: "BJ-Y",
      name: "Commune Y",
      population: 5000,
      crops: [],
      missingCrops: ["MAIZE"],
    });
    expect(noArea.status).toBe("not-evaluated");
    expect(noArea.reason).toBe("Aucune surface de toute la commune");
    const noPopulation = computeCommuneBalance({
      code: "BJ-Z",
      name: "Commune Z",
      population: null,
      crops: [
        {
          cropCode: "MAIZE",
          areaHa: 100,
          areaLowHa: 100,
          areaHighHa: 100,
          source: survey,
          yieldRef: flatYield(1),
        },
      ],
      missingCrops: [],
    });
    expect(noPopulation.status).toBe("not-evaluated");
    expect(NEEDS.staplesShare).toBe(0.72);
  });
});
