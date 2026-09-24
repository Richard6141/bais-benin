import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_PHONE_PATTERN,
  allocateByWeight,
  bboxOf,
  codeFragment,
  createRandom,
  deterministicUuid,
  generateSyntheticRegistry,
  pointInPolygon,
  randomPointInPolygon,
  ringAreaHa,
  squareParcelAround,
  type CommuneInput,
  type Polygon,
  type RegistryInput,
} from "..";

function square(lng: number, lat: number, size: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  };
}

const communes: CommuneInput[] = [
  {
    code: "BJ-DON-002",
    name: "Copargo",
    departementCode: "BJ-DO",
    departementName: "Donga",
    zoneCode: "ZAE_4",
    ruralPopulationWeight: 3,
    polygon: square(1.5, 9.8, 0.2),
  },
  {
    code: "BJ-ATL-001",
    name: "Abomey-Calavi",
    departementCode: "BJ-AQ",
    departementName: "Atlantique",
    zoneCode: "ZAE_6",
    ruralPopulationWeight: 5,
    polygon: square(2.3, 6.4, 0.2),
  },
  {
    code: "BJ-OUE-002",
    name: "Adjohoun",
    departementCode: "BJ-OU",
    departementName: "Ouémé",
    zoneCode: "ZAE_6",
    ruralPopulationWeight: 2,
    polygon: square(2.4, 6.7, 0.15),
  },
];

const input: RegistryInput = {
  communes,
  crops: [
    {
      code: "MAIZE",
      mainZoneCodes: ["ZAE_4", "ZAE_6"],
      cycle: "ANNUAL",
      calendar: { south: { harvest: [7, 8] } },
    },
    {
      code: "YAM",
      mainZoneCodes: ["ZAE_4"],
      cycle: "ANNUAL",
      calendar: { north: { harvest: [8, 9] } },
    },
    {
      code: "CASSAVA",
      mainZoneCodes: ["ZAE_6"],
      cycle: "ANNUAL",
      calendar: { south: { harvest: [12, 5] } },
    },
    {
      code: "OIL_PALM",
      mainZoneCodes: ["ZAE_6"],
      cycle: "PERENNIAL",
      calendar: { south: { harvest: [2, 5] } },
    },
    {
      code: "COTTON",
      mainZoneCodes: ["ZAE_2"],
      cycle: "ANNUAL",
      calendar: { north: { harvest: [11, 1] } },
    },
  ],
  campaigns: [
    { code: "2023-2024", startYear: 2023 },
    { code: "2025-2026", startYear: 2025 },
    { code: "2024-2025", startYear: 2024 },
  ],
};

const zoneCrops: Record<string, readonly string[]> = {
  ZAE_4: ["MAIZE", "YAM"],
  ZAE_6: ["MAIZE", "CASSAVA", "OIL_PALM"],
};

describe("Générateur pseudo-aléatoire", () => {
  it("rejoue la même suite pour une même graine", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it("respecte les bornes des entiers et les poids du tirage pondéré", () => {
    const random = createRandom(7);
    let heavy = 0;
    for (let i = 0; i < 2000; i += 1) {
      const value = random.int(3, 5);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(5);
      if (
        random.weightedPick([
          { value: "a", weight: 9 },
          { value: "b", weight: 1 },
        ]) === "a"
      ) {
        heavy += 1;
      }
    }
    expect(heavy / 2000).toBeGreaterThan(0.85);
  });
});

describe("Géométrie", () => {
  const polygon = square(2, 7, 0.1);

  it("distingue l'intérieur de l'extérieur d'un polygone", () => {
    expect(pointInPolygon([2.05, 7.05], polygon)).toBe(true);
    expect(pointInPolygon([2.5, 7.05], polygon)).toBe(false);
    expect(bboxOf(polygon.coordinates[0] ?? [])).toEqual([2, 7, 2.1, 7.1]);
  });

  it("tire des points dans le polygone, y compris multi-parties", () => {
    const random = createRandom(3);
    const multi = {
      type: "MultiPolygon" as const,
      coordinates: [polygon.coordinates, square(3, 8, 0.05).coordinates],
    };
    for (let i = 0; i < 200; i += 1) {
      expect(pointInPolygon(randomPointInPolygon(random, multi), multi)).toBe(true);
    }
  });

  it("construit un contour de parcelle d'aire approximative, fermé, à 4 à 6 sommets", () => {
    const random = createRandom(11);
    for (let i = 0; i < 50; i += 1) {
      const areaHa = 0.5 + random.next() * 5;
      const ring = squareParcelAround([2.05, 7.05], areaHa, random);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring.length - 1).toBeGreaterThanOrEqual(4);
      expect(ring.length - 1).toBeLessThanOrEqual(6);
      expect(ringAreaHa(ring) / areaHa).toBeGreaterThan(0.6);
      expect(ringAreaHa(ring) / areaHa).toBeLessThan(1.5);
    }
  });
});

describe("Identifiants", () => {
  it("produit des UUID stables au format v5 et des fragments de code sans accent", () => {
    expect(deterministicUuid("x")).toBe(deterministicUuid("x"));
    expect(deterministicUuid("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(deterministicUuid("x")).not.toBe(deterministicUuid("y"));
    expect(codeFragment("N'Dali")).toBe("NDA");
    expect(codeFragment("Ouémé")).toBe("OUE");
  });

  it("répartit exactement le total selon les poids", () => {
    const parts = allocateByWeight([3, 5, 2], 5000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(parts[1]).toBe(2500);
  });
});

describe("Registre synthétique", () => {
  const registry = generateSyntheticRegistry(input, { seed: 2026, farmCount: 5000 });
  const communesByCode = new Map(communes.map((commune) => [commune.code, commune]));

  it("est identique pour une même graine et différent pour une autre", () => {
    const again = generateSyntheticRegistry(input, { seed: 2026, farmCount: 5000 });
    expect(JSON.stringify(again)).toBe(JSON.stringify(registry));
    const other = generateSyntheticRegistry(input, { seed: 2027, farmCount: 50 });
    expect(other.farmers[0]?.phone).not.toBe(registry.farmers[0]?.phone);
  });

  it("respecte le nombre d'exploitations et la répartition par commune", () => {
    expect(registry.farms).toHaveLength(5000);
    expect(registry.farmers).toHaveLength(5000);
    const perCommune = new Map<string, number>();
    for (const farm of registry.farms) {
      perCommune.set(farm.communeCode, (perCommune.get(farm.communeCode) ?? 0) + 1);
    }
    expect(perCommune.get("BJ-ATL-001")).toBe(2500);
    expect(perCommune.get("BJ-DON-002")).toBe(1500);
  });

  it("ne produit aucun doublon de code, d'identifiant ni de téléphone", () => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    expect(unique(registry.farmers.map((f) => f.code))).toBe(true);
    expect(unique(registry.farms.map((f) => f.code))).toBe(true);
    expect(unique(registry.parcels.map((p) => p.code))).toBe(true);
    expect(
      unique([...registry.farms, ...registry.parcels, ...registry.parcelCrops].map((r) => r.id)),
    ).toBe(true);
    expect(unique(registry.farmers.map((f) => f.phone))).toBe(true);
    expect(registry.farms[0]?.code).toMatch(/^BJ-DON-COP-\d{6}$/);
  });

  it("formate les téléphones dans la plage fictive", () => {
    for (const farmer of registry.farmers) {
      expect(farmer.phone).toMatch(SYNTHETIC_PHONE_PATTERN);
    }
  });

  it("fait coïncider la somme des parcelles avec la superficie de l'exploitation", () => {
    const areaByFarm = new Map<string, number>();
    for (const parcel of registry.parcels) {
      areaByFarm.set(parcel.farmId, (areaByFarm.get(parcel.farmId) ?? 0) + parcel.declaredAreaHa);
    }
    for (const farm of registry.farms) {
      expect(Math.abs((areaByFarm.get(farm.id) ?? 0) - farm.totalAreaHa)).toBeLessThan(0.001);
      expect(farm.totalAreaHa).toBeGreaterThanOrEqual(0.1);
      expect(farm.totalAreaHa).toBeLessThanOrEqual(25);
    }
  });

  it("n'attribue que des cultures de la zone, sur les deux dernières campagnes", () => {
    const farmsById = new Map(registry.farms.map((farm) => [farm.id, farm]));
    const parcelsById = new Map(registry.parcels.map((parcel) => [parcel.id, parcel]));
    const campaigns = new Set(registry.parcelCrops.map((pc) => pc.campaignCode));
    expect([...campaigns].sort()).toEqual(["2024-2025", "2025-2026"]);
    for (const parcelCrop of registry.parcelCrops) {
      const farm = farmsById.get(parcelsById.get(parcelCrop.parcelId)?.farmId ?? "");
      expect(zoneCrops[farm?.zoneCode ?? ""]).toContain(parcelCrop.cropCode);
      if (parcelCrop.cropCode === "OIL_PALM") expect(parcelCrop.seasonCode).toBe("ANNUAL");
    }
  });

  it("approche la répartition des statuts à 3 points près", () => {
    const counts = { DECLARED: 0, AGENT_VERIFIED: 0, FIELD_VERIFIED: 0 };
    for (const farm of registry.farms) counts[farm.verificationStatus] += 1;
    expect(Math.abs(counts.DECLARED / 5000 - 0.55)).toBeLessThan(0.03);
    expect(Math.abs(counts.AGENT_VERIFIED / 5000 - 0.3)).toBeLessThan(0.03);
    expect(Math.abs(counts.FIELD_VERIFIED / 5000 - 0.15)).toBeLessThan(0.03);
  });

  it("place chaque exploitation et chaque parcelle dans sa commune", () => {
    for (const farm of registry.farms) {
      const commune = communesByCode.get(farm.communeCode);
      expect(commune && pointInPolygon(farm.location, commune.polygon)).toBe(true);
    }
    for (const parcel of registry.parcels) {
      const commune = communesByCode.get(parcel.communeCode);
      expect(commune && pointInPolygon(parcel.centroid, commune.polygon)).toBe(true);
      expect(Math.abs(parcel.computedAreaHa / parcel.declaredAreaHa - 1)).toBeLessThan(0.45);
    }
  });

  it("marque toutes les lignes comme synthétiques et attribue des identités plausibles", () => {
    const women = registry.farmers.filter((farmer) => farmer.gender === "F").length;
    expect(Math.abs(women / 5000 - 0.35)).toBeLessThan(0.03);
    for (const farmer of registry.farmers.slice(0, 200)) {
      expect(farmer.reliability).toBe("SYNTHETIC");
      expect(farmer.sourceId).toBe("BAIS_SEED");
      expect(farmer.birthYear).toBeGreaterThanOrEqual(1950);
      expect(farmer.birthYear).toBeLessThanOrEqual(2004);
      expect(farmer.householdSize).toBeGreaterThanOrEqual(2);
      expect(farmer.householdSize).toBeLessThanOrEqual(12);
      expect(farmer.firstName.length).toBeGreaterThan(1);
    }
  });
});
