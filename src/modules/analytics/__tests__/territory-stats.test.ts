import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommuneStatsRow,
  DepartementStatsRow,
  NationalStatsRow,
} from "@/database/sql/territory-stats.sql";

// Aucune base ici : la couche SQL est remplacée par des lignes simulées.
const sql = vi.hoisted(() => ({
  communeStats: vi.fn(),
  departementStats: vi.fn(),
  nationalStats: vi.fn(),
}));

vi.mock("@/database/sql/territory-stats.sql", () => ({
  VERIFICATION_STATUSES: ["DECLARED", "AGENT_VERIFIED", "FIELD_VERIFIED", "DISPUTED"],
  communeStats: sql.communeStats,
  departementStats: sql.departementStats,
  nationalStats: sql.nationalStats,
}));

const {
  getCommuneStats,
  getDepartementStats,
  getNationalStats,
  mapCommuneRow,
  mapDepartementRow,
  mapNationalRow,
  reliabilityFromShare,
  statsFiltersSchema,
  weightedVerifiedShare,
} = await import("..");

const NOW = new Date("2026-09-24T12:00:00Z");

const djougou: CommuneStatsRow = {
  commune_code: "BJ-DON-003",
  commune_name: "Djougou",
  departement_code: "BJ-DO",
  farm_count: 4,
  farmer_count: 3,
  declared_area_ha: 12.5,
  verified_share: 1,
  crop_codes: ["MAIZE", "YAM"],
};

const parakou: CommuneStatsRow = {
  commune_code: "BJ-BOR-005",
  commune_name: "Parakou",
  departement_code: "BJ-BO",
  farm_count: 1,
  farmer_count: 1,
  declared_area_ha: 2,
  verified_share: 0,
  crop_codes: ["COTTON"],
};

describe("statsFiltersSchema", () => {
  it("accepte des filtres vides ou bien formés, en nettoyant les espaces", () => {
    expect(statsFiltersSchema.parse({})).toEqual({});
    expect(
      statsFiltersSchema.parse({
        cropCode: " MAIZE ",
        campaignCode: "2026-2027",
        departementCode: "BJ-DO",
        verificationStatus: "FIELD_VERIFIED",
      }),
    ).toEqual({
      cropCode: "MAIZE",
      campaignCode: "2026-2027",
      departementCode: "BJ-DO",
      verificationStatus: "FIELD_VERIFIED",
    });
  });

  it("refuse les codes mal formés et les statuts inconnus", () => {
    expect(statsFiltersSchema.safeParse({ cropCode: "maïs" }).success).toBe(false);
    expect(statsFiltersSchema.safeParse({ campaignCode: "2026" }).success).toBe(false);
    expect(statsFiltersSchema.safeParse({ departementCode: "DON" }).success).toBe(false);
    expect(statsFiltersSchema.safeParse({ verificationStatus: "OFFICIAL" }).success).toBe(false);
  });
});

describe("fiabilité des agrégats", () => {
  it("passe à FIELD_VERIFIED à partir de 80 % d'exploitations vérifiées", () => {
    expect(reliabilityFromShare(0)).toBe("DECLARED");
    expect(reliabilityFromShare(0.79)).toBe("DECLARED");
    expect(reliabilityFromShare(0.8)).toBe("FIELD_VERIFIED");
    expect(reliabilityFromShare(1)).toBe("FIELD_VERIFIED");
  });

  it("pondère la part vérifiée par le nombre d'exploitations", () => {
    expect(weightedVerifiedShare([])).toBe(0);
    expect(weightedVerifiedShare([{ farmCount: 0, verifiedShare: 1 }])).toBe(0);
    // 4 vérifiées sur 4 + 0 sur 1 = 4 / 5.
    expect(
      weightedVerifiedShare([
        { farmCount: 4, verifiedShare: 1 },
        { farmCount: 1, verifiedShare: 0 },
      ]),
    ).toBeCloseTo(0.8, 9);
  });
});

describe("mapping des lignes SQL", () => {
  it("convertit une ligne commune en camelCase avec sa fiabilité", () => {
    expect(mapCommuneRow(djougou)).toEqual({
      communeCode: "BJ-DON-003",
      communeName: "Djougou",
      departementCode: "BJ-DO",
      farmCount: 4,
      farmerCount: 3,
      declaredAreaHa: 12.5,
      verifiedShare: 1,
      cropCodes: ["MAIZE", "YAM"],
      reliability: "FIELD_VERIFIED",
    });
    expect(mapCommuneRow(parakou).reliability).toBe("DECLARED");
  });

  it("convertit une ligne département et une ligne nationale", () => {
    const departement: DepartementStatsRow = {
      departement_code: "BJ-DO",
      departement_name: "Donga",
      commune_count: 4,
      farm_count: 4,
      farmer_count: 3,
      declared_area_ha: 12.5,
      verified_share: 0.75,
      crop_codes: ["MAIZE"],
    };
    expect(mapDepartementRow(departement)).toMatchObject({
      departementCode: "BJ-DO",
      departementName: "Donga",
      communeCount: 4,
      verifiedShare: 0.75,
      reliability: "DECLARED",
    });
    const national: NationalStatsRow = {
      farm_count: 5,
      farmer_count: 4,
      declared_area_ha: 14.5,
      verified_share: 0.8,
      commune_count_with_farms: 2,
    };
    expect(mapNationalRow(national)).toEqual({
      farmCount: 5,
      farmerCount: 4,
      declaredAreaHa: 14.5,
      verifiedShare: 0.8,
      communeCountWithFarms: 2,
    });
  });
});

describe("services d'agrégats", () => {
  beforeEach(() => {
    sql.communeStats.mockReset();
    sql.departementStats.mockReset();
    sql.nationalStats.mockReset();
  });

  it("valide les filtres, appelle le SQL et calcule la provenance globale", async () => {
    sql.communeStats.mockResolvedValue([djougou, parakou]);
    const result = await getCommuneStats({ cropCode: "MAIZE " }, NOW);
    expect(sql.communeStats).toHaveBeenCalledWith({
      cropCode: "MAIZE",
      campaignCode: undefined,
      departementCode: undefined,
      verificationStatus: undefined,
    });
    expect(result.items).toHaveLength(2);
    expect(result.filters).toEqual({ cropCode: "MAIZE" });
    expect(result.provenance).toEqual({
      source: "registre BAIS",
      generatedAt: NOW,
      reliability: "FIELD_VERIFIED",
      verifiedShare: 0.8,
      farmCount: 5,
    });
  });

  it("rejette des filtres invalides avant tout appel SQL", async () => {
    await expect(getDepartementStats({ departementCode: "Donga" })).rejects.toThrow();
    expect(sql.departementStats).not.toHaveBeenCalled();
  });

  it("renvoie une provenance déclarative sur un registre vide", async () => {
    sql.nationalStats.mockResolvedValue({
      farm_count: 0,
      farmer_count: 0,
      declared_area_ha: 0,
      verified_share: 0,
      commune_count_with_farms: 0,
    });
    const result = await getNationalStats({}, NOW);
    expect(result.farmCount).toBe(0);
    expect(result.provenance.reliability).toBe("DECLARED");
    expect(result.provenance.farmCount).toBe(0);
  });
});
