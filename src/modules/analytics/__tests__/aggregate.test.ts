import { describe, expect, it, vi } from "vitest";
import type { CampaignRow, CropStatsRow } from "@/database/sql/dashboard.sql";

vi.mock("@/database/client", () => ({ prisma: {} }));

const { buildCropRows, buildFigures, changePct, resolveCampaign, sumCropRows, tonnes } =
  await import("../aggregate");

const campaign = (code: string, status: CampaignRow["status"], year: number): CampaignRow => ({
  id: code,
  code,
  status,
  start_year: year,
  starts_on: `${year}-04-01`,
  ends_on: `${year + 1}-03-31`,
});

const cropRow = (overrides: Partial<CropStatsRow>): CropStatsRow => ({
  commune_id: "c1",
  commune_code: "BJ-DON-003",
  commune_name: "Djougou",
  departement_code: "BJ-DO",
  campaign_id: "k",
  crop_code: "MAIZE",
  crop_name: "Maïs",
  color_hex: null,
  typical_yield_t_per_ha: 1.5,
  farm_count: 10,
  verified_farm_count: 5,
  parcel_count: 12,
  measured_parcel_count: 6,
  area_ha: 8,
  measured_area_ha: 9,
  harvested_area_ha: 4,
  production_kg: 5000,
  declared_harvest_count: 3,
  refreshed_at: new Date("2026-09-25T04:00:00Z"),
  ...overrides,
});

describe("campagne affichée", () => {
  const campaigns = [
    campaign("2024-2025", "CLOSED", 2024),
    campaign("2025-2026", "CLOSED", 2025),
    campaign("2026-2027", "OPEN", 2026),
    campaign("2027-2028", "PLANNED", 2027),
  ];

  it("prend la campagne ouverte et la précédente par défaut", () => {
    const { current, previous } = resolveCampaign(campaigns);
    expect([current.code, previous?.code]).toEqual(["2026-2027", "2025-2026"]);
  });

  it("prend la dernière close sans campagne ouverte, et refuse un code inconnu", () => {
    const closedOnly = campaigns.filter((c) => c.status !== "OPEN");
    expect(resolveCampaign(closedOnly).current.code).toBe("2025-2026");
    expect(resolveCampaign(campaigns, "2024-2025").previous).toBeNull();
    expect(() => resolveCampaign(campaigns, "1990-1991")).toThrow(/inconnue/);
  });
});

describe("chiffres d'un périmètre", () => {
  it("distingue « récolte non déclarée » d'une production nulle", () => {
    expect(tonnes(0, 0)).toBeNull();
    expect(tonnes(0, 2)).toBe(0);
    expect(tonnes(2500, 1)).toBe(2.5);
  });

  it("calcule une variation seulement avec une base non nulle", () => {
    expect(changePct(110, 100)).toBe(10);
    expect(changePct(95, 100)).toBe(-5);
    expect(changePct(10, 0)).toBeNull();
    expect(changePct(null, 10)).toBeNull();
  });

  it("masque toutes les tuiles sous 5 exploitations, pas à zéro", () => {
    const small = buildFigures({
      farm: null,
      crop: sumCropRows([cropRow({ farm_count: 3 })]),
      farmerCount: 3,
    });
    expect(small.masked).toBe(true);
    expect(small.farmerCount).toBeNull();
    expect(small.productionT).toBeNull();
    expect(small.verifiedShare).toBeNull();
    const empty = buildFigures({ farm: null, crop: sumCropRows([]), farmerCount: 0 });
    expect(empty).toMatchObject({ masked: false, farmCount: 0, verifiedShare: null });
  });

  it("lit l'effectif du registre sans culture filtrée et celui de la culture sinon", () => {
    const crop = sumCropRows([cropRow({})]);
    const farm = {
      farmCount: 40,
      verifiedFarmCount: 36,
      declaredAreaHa: 70,
      parcelCount: 50,
      measuredParcelCount: 25,
      measuredAreaHa: 68,
      refreshedAt: null,
    };
    expect(buildFigures({ farm, crop, farmerCount: 38 })).toMatchObject({
      farmCount: 40,
      declaredAreaHa: 70,
      measuredParcelShare: 0.5,
      verifiedShare: 0.9,
      reliability: "FIELD_VERIFIED",
      cropAreaHa: 8,
      productionT: 5,
    });
    expect(buildFigures({ farm: null, crop, farmerCount: 10 })).toMatchObject({
      farmCount: 10,
      declaredAreaHa: 8,
      verifiedShare: 0.5,
      reliability: "DECLARED",
    });
  });
});

describe("production par culture", () => {
  it("additionne les communes, calcule le rendement sur la surface récoltée", () => {
    const rows = buildCropRows([
      cropRow({}),
      cropRow({
        commune_id: "c2",
        commune_code: "BJ-DON-001",
        production_kg: 1000,
        harvested_area_ha: 1,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      farmCount: 20,
      productionT: 6,
      harvestedAreaHa: 5,
      yieldTPerHa: 1.2,
      yieldGapPct: -20,
    });
  });

  it("trie par production et masque la plus petite culture avec la seule masquée", () => {
    const rows = buildCropRows([
      cropRow({ crop_code: "RICE", crop_name: "Riz", production_kg: 9000 }),
      cropRow({ crop_code: "MAIZE", production_kg: 5000 }),
      cropRow({
        crop_code: "YAM",
        crop_name: "Igname",
        farm_count: 6,
        production_kg: 0,
        declared_harvest_count: 0,
      }),
      cropRow({ crop_code: "SORGHUM", crop_name: "Sorgho", farm_count: 2 }),
    ]);
    expect(rows.map((r) => r.cropCode)).toEqual(["RICE", "MAIZE", "SORGHUM", "YAM"]);
    expect(rows.filter((r) => r.masked).map((r) => r.cropCode)).toEqual(["SORGHUM", "YAM"]);
    expect(rows.find((r) => r.cropCode === "SORGHUM")).toMatchObject({
      farmCount: null,
      productionT: null,
    });
  });
});
