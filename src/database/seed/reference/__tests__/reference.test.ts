import { describe, expect, it } from "vitest";

import {
  AGRO_ECOLOGICAL_ZONES,
  AGRO_ECOLOGICAL_ZONE_CODES,
  CROPS,
  DEPARTEMENT_CODES,
  SEASON_TEMPLATES,
  buildSeasonCode,
  campaignWindow,
  type MonthWindow,
} from "..";

function expectValidWindow(window: MonthWindow): void {
  for (const month of window) {
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(Number.isInteger(month)).toBe(true);
  }
}

describe("Référentiel des cultures", () => {
  it("contient exactement les 21 cultures de phase 1", () => {
    expect(CROPS).toHaveLength(21);
  });

  it("attribue un code unique en SCREAMING_SNAKE_CASE à chaque culture", () => {
    const codes = CROPS.map((crop) => crop.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("ne référence que des zones agro-écologiques existantes", () => {
    const knownZones: readonly string[] = AGRO_ECOLOGICAL_ZONE_CODES;
    for (const crop of CROPS) {
      expect(crop.mainZones.length).toBeGreaterThan(0);
      for (const zone of crop.mainZones) {
        expect(knownZones).toContain(zone);
      }
    }
  });

  it("porte au moins un calendrier par culture, avec des mois entre 1 et 12", () => {
    for (const crop of CROPS) {
      const regimes = [crop.calendar.south, crop.calendar.north].filter(
        (calendar) => calendar !== undefined,
      );
      expect(regimes.length).toBeGreaterThan(0);
      for (const calendar of regimes) {
        expectValidWindow(calendar.harvest);
        if (calendar.sowing) {
          expectValidWindow(calendar.sowing);
        }
      }
    }
  });

  it("n'omet le semis que pour les cultures de cueillette", () => {
    for (const crop of CROPS) {
      for (const calendar of [crop.calendar.south, crop.calendar.north]) {
        if (calendar && calendar.sowing === undefined) {
          expect(crop.cycle).toBe("GATHERED");
        }
      }
    }
  });

  it("marque tous les rendements comme estimés et issus du générateur de démonstration", () => {
    for (const crop of CROPS) {
      expect(crop.typicalYieldTPerHa).toBeGreaterThan(0);
      expect(crop.reliability).toBe("ESTIMATED");
      expect(crop.sourceId).toBe("BAIS_SEED");
    }
  });
});

describe("Zones agro-écologiques", () => {
  it("contient les 8 zones du zonage INRAB / MAEP", () => {
    expect(AGRO_ECOLOGICAL_ZONES).toHaveLength(8);
    expect(AGRO_ECOLOGICAL_ZONES.map((zone) => zone.code)).toEqual([...AGRO_ECOLOGICAL_ZONE_CODES]);
  });

  it("couvre les 12 départements, chacun rattaché à au moins une zone", () => {
    const covered = new Set(AGRO_ECOLOGICAL_ZONES.flatMap((zone) => zone.departementCodes));
    expect(DEPARTEMENT_CODES).toHaveLength(12);
    for (const departement of DEPARTEMENT_CODES) {
      expect(covered.has(departement)).toBe(true);
    }
  });

  it("ne rattache que des départements connus, sans doublon dans une zone", () => {
    const known: readonly string[] = DEPARTEMENT_CODES;
    for (const zone of AGRO_ECOLOGICAL_ZONES) {
      expect(zone.departementCodes.length).toBeGreaterThan(0);
      expect(new Set(zone.departementCodes).size).toBe(zone.departementCodes.length);
      for (const departement of zone.departementCodes) {
        expect(known).toContain(departement);
      }
    }
  });

  it("porte une fourchette pluviométrique cohérente", () => {
    for (const zone of AGRO_ECOLOGICAL_ZONES) {
      const [min, max] = zone.indicativeRainfallMm;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThan(min);
    }
  });
});

describe("Campagnes et sous-saisons", () => {
  it("nomme la campagne par son année de démarrage et son année de clôture", () => {
    expect(buildSeasonCode(2025)).toBe("2025-2026");
    expect(buildSeasonCode(2023)).toBe("2023-2024");
  });

  it("borne la campagne du 1er avril au 31 mars suivant", () => {
    expect(campaignWindow(2025)).toEqual({ startsOn: "2025-04-01", endsOn: "2026-03-31" });
  });

  it("définit les quatre sous-saisons avec des fenêtres valides", () => {
    expect(SEASON_TEMPLATES.map((season) => season.code)).toEqual([
      "MAIN_RAINY",
      "SHORT_RAINY",
      "DRY",
      "ANNUAL",
    ]);
    for (const season of SEASON_TEMPLATES) {
      for (const window of Object.values(season.windows)) {
        if (window) {
          expectValidWindow(window);
        }
      }
    }
  });

  it("réserve la petite saison des pluies au régime bimodal", () => {
    const shortRainy = SEASON_TEMPLATES.find((season) => season.code === "SHORT_RAINY");
    expect(shortRainy?.windows.BIMODAL).not.toBeNull();
    expect(shortRainy?.windows.UNIMODAL).toBeNull();
  });
});
