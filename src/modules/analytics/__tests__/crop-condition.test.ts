import { describe, expect, it, vi } from "vitest";
import type { CropConditionRow } from "@/database/sql/crop-condition.sql";

vi.mock("@/database/client", () => ({ prisma: {} }));

const { buildCropCondition } = await import("../crop-condition");

const row = (over: Partial<CropConditionRow>): CropConditionRow => ({
  crop_code: "MAIZE",
  crop_name: "Maïs",
  departement_code: "BJ-BO",
  departement_name: "Borgou",
  condition: "GOOD",
  parcels: 10,
  area_ha: 20,
  ...over,
});

describe("état des cultures", () => {
  it("calcule les parts sur la surface observée, hors parcelles non observées", () => {
    const [maize] = buildCropCondition([
      row({ condition: "GOOD", area_ha: 30 }),
      row({ condition: "FAIR", area_ha: 50 }),
      row({ condition: "POOR", area_ha: 15 }),
      row({ condition: "TO_VERIFY", area_ha: 5 }),
      row({ condition: "UNOBSERVED", area_ha: 400 }),
    ]);
    expect(maize!.national.goodShare).toBeCloseTo(0.3, 6);
    expect(maize!.national.poorShare).toBeCloseTo(0.15, 6);
    expect(maize!.national.toVerifyShare).toBeCloseTo(0.05, 6);
    expect(maize!.national.areaHa).toBe(500);
  });

  it("masque un département de moins de 5 parcelles et classe les cultures par surface", () => {
    const crops = buildCropCondition([
      row({ crop_code: "COTTON", crop_name: "Coton", area_ha: 10 }),
      row({ departement_code: "BJ-AL", departement_name: "Alibori", area_ha: 90 }),
      row({ departement_code: "BJ-DO", departement_name: "Donga", parcels: 3, area_ha: 6 }),
    ]);
    expect(crops.map((c) => c.code)).toEqual(["MAIZE", "COTTON"]);
    const donga = crops[0]!.departements.find((d) => d.code === "BJ-DO");
    expect(donga).toMatchObject({ masked: true, breakdown: null });
    // Le total national garde les parcelles des départements masqués.
    expect(crops[0]!.national.parcels).toBe(13);
    expect(crops[0]!.departements[0]!.code).toBe("BJ-AL");
  });

  it("laisse les parts vides quand rien n'a été observé", () => {
    const [maize] = buildCropCondition([row({ condition: "UNOBSERVED" })]);
    expect(maize!.national.goodShare).toBeNull();
  });
});
