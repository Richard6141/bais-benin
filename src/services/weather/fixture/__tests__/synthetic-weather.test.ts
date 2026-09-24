import { describe, expect, it } from "vitest";

import {
  CLIMATE_PROFILES,
  ZONE_CODES,
  applyDrySpell,
  applyFloodEpisode,
  applyHeatWave,
  generateDailyWeather,
  monthlyPrecipitation,
  totalPrecipitation,
  type DailyWeather,
  type ZoneCode,
} from "..";

// Centroïdes approximatifs de communes représentatives de chaque zone.
const LOCATIONS: Record<ZoneCode, { latitude: number; longitude: number }> = {
  ZAE_1: { latitude: 11.87, longitude: 3.38 }, // Malanville
  ZAE_2: { latitude: 11.13, longitude: 2.94 }, // Kandi
  ZAE_3: { latitude: 9.34, longitude: 2.63 }, // Parakou
  ZAE_4: { latitude: 10.3, longitude: 1.38 }, // Natitingou
  ZAE_5: { latitude: 7.93, longitude: 1.98 }, // Savalou
  ZAE_6: { latitude: 6.67, longitude: 2.15 }, // Allada
  ZAE_7: { latitude: 7.0, longitude: 2.1 }, // Zogbodomey
  ZAE_8: { latitude: 6.37, longitude: 2.43 }, // Cotonou
};

function fullYear(zoneCode: ZoneCode, seed = 42): DailyWeather[] {
  return generateDailyWeather({
    zoneCode,
    ...LOCATIONS[zoneCode],
    from: "2025-01-01",
    to: "2025-12-31",
    seed,
  });
}

function monthTotal(series: readonly DailyWeather[], month: string): number {
  return monthlyPrecipitation(series).get(`2025-${month}`) ?? 0;
}

/** Accès strict à un jour : un indice hors série fait échouer le test au lieu de passer en silence. */
function dayAt(series: readonly DailyWeather[], index: number): DailyWeather {
  const day = series[index];
  if (!day) {
    throw new Error(`Aucun jour à l'indice ${index}`);
  }
  return day;
}

describe("profils climatiques", () => {
  it("couvrent les huit zones avec douze mois chacun", () => {
    for (const zone of ZONE_CODES) {
      const profile = CLIMATE_PROFILES[zone];
      expect(profile.months).toHaveLength(12);
      expect(profile.reliability).toBe("ESTIMATED");
      for (const month of profile.months) {
        expect(month.rainDays).toBeLessThanOrEqual(31);
        expect(month.tmaxC).toBeGreaterThan(month.tminC);
        expect(month.humidityPct).toBeGreaterThan(0);
      }
    }
  });

  it("donnent un cumul annuel cohérent avec le régime de chaque zone", () => {
    expect(CLIMATE_PROFILES.ZAE_1.annualRainMm).toBeGreaterThanOrEqual(700);
    expect(CLIMATE_PROFILES.ZAE_1.annualRainMm).toBeLessThanOrEqual(1100);
    expect(CLIMATE_PROFILES.ZAE_8.annualRainMm).toBeGreaterThanOrEqual(1100);
    expect(CLIMATE_PROFILES.ZAE_8.annualRainMm).toBeLessThanOrEqual(1500);
  });
});

describe("generateDailyWeather", () => {
  it("est déterministe pour une même graine et un même lieu", () => {
    const first = fullYear("ZAE_3", 7);
    const second = fullYear("ZAE_3", 7);
    expect(second).toEqual(first);
  });

  it("change de série quand la graine ou le lieu change", () => {
    const reference = fullYear("ZAE_3", 7);
    const otherSeed = fullYear("ZAE_3", 8);
    const otherPlace = generateDailyWeather({
      zoneCode: "ZAE_3",
      latitude: 9.7,
      longitude: 2.7,
      from: "2025-01-01",
      to: "2025-12-31",
      seed: 7,
    });
    expect(otherSeed).not.toEqual(reference);
    expect(otherPlace).not.toEqual(reference);
  });

  it("produit un jour par date, bornes incluses, avec les métadonnées de provenance", () => {
    const series = generateDailyWeather({
      zoneCode: "ZAE_6",
      ...LOCATIONS.ZAE_6,
      from: "2025-02-27",
      to: "2025-03-02",
      seed: 1,
    });
    expect(series.map((day) => day.date)).toEqual([
      "2025-02-27",
      "2025-02-28",
      "2025-03-01",
      "2025-03-02",
    ]);
    for (const day of series) {
      expect(day.sourceId).toBe("BAIS_SEED");
      expect(day.reliability).toBe("ESTIMATED");
      expect(day.kind).toBe("OBSERVED");
      expect(day.tempMaxC).toBeGreaterThan(day.tempMinC);
      expect(day.precipitationMm).toBeGreaterThanOrEqual(0);
      expect(day.et0Mm).toBeGreaterThan(0);
      expect(day.relativeHumidityPct).toBeGreaterThanOrEqual(15);
      expect(day.relativeHumidityPct).toBeLessThanOrEqual(100);
      expect(day.windKmh).toBeGreaterThan(0);
    }
  });

  it("marque FORECAST les jours à partir de forecastFrom", () => {
    const series = generateDailyWeather({
      zoneCode: "ZAE_2",
      ...LOCATIONS.ZAE_2,
      from: "2025-06-01",
      to: "2025-06-10",
      seed: 3,
      forecastFrom: "2025-06-08",
    });
    expect(series.filter((day) => day.kind === "OBSERVED")).toHaveLength(7);
    expect(series.filter((day) => day.kind === "FORECAST")).toHaveLength(3);
  });

  it("rejette une date invalide ou une plage inversée", () => {
    expect(() =>
      generateDailyWeather({
        zoneCode: "ZAE_1",
        ...LOCATIONS.ZAE_1,
        from: "2025-02-30",
        to: "2025-03-01",
        seed: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      generateDailyWeather({
        zoneCode: "ZAE_1",
        ...LOCATIONS.ZAE_1,
        from: "2025-03-02",
        to: "2025-03-01",
        seed: 1,
      }),
    ).toThrow(RangeError);
  });

  // La variabilité interannuelle simulée est de l'ordre de 12 à 15 % du cumul, comme sur les
  // séries observées : une année isolée peut sortir des bornes, la moyenne sur plusieurs années non.
  it("donne un cumul annuel entre 700 et 1 100 mm dans l'extrême nord (ZAE_1)", () => {
    for (const seed of [1, 3, 5]) {
      const total = totalPrecipitation(fullYear("ZAE_1", seed));
      expect(total).toBeGreaterThanOrEqual(700);
      expect(total).toBeLessThanOrEqual(1100);
    }
  });

  it("donne un cumul annuel entre 1 100 et 1 500 mm sur le littoral (ZAE_8)", () => {
    for (const seed of [2, 4, 6]) {
      const total = totalPrecipitation(fullYear("ZAE_8", seed));
      expect(total).toBeGreaterThanOrEqual(1100);
      expect(total).toBeLessThanOrEqual(1500);
    }
  });

  it("reste sans biais : la moyenne de dix années approche le cumul du profil à 10 % près", () => {
    for (const zone of ["ZAE_1", "ZAE_4", "ZAE_8"] as const) {
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mean =
        seeds.reduce((sum, seed) => sum + totalPrecipitation(fullYear(zone, seed)), 0) /
        seeds.length;
      const expected = CLIMATE_PROFILES[zone].annualRainMm;
      expect(Math.abs(mean - expected) / expected).toBeLessThan(0.1);
    }
  });

  it("reproduit le régime bimodal du littoral : juin et octobre dépassent août", () => {
    const series = fullYear("ZAE_8", 11);
    expect(monthTotal(series, "06")).toBeGreaterThan(monthTotal(series, "08"));
    expect(monthTotal(series, "10")).toBeGreaterThan(monthTotal(series, "08"));
  });

  it("reproduit le régime unimodal du nord cotonnier : août est le mois le plus arrosé", () => {
    const totals = monthlyPrecipitation(fullYear("ZAE_2", 11));
    const wettest = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(wettest?.[0]).toBe("2025-08");
    expect(monthTotal(fullYear("ZAE_2", 11), "01")).toBeLessThan(10);
  });

  it("garde les maximales de saison sèche au-dessus de 35 °C dans le nord en mars-avril", () => {
    const series = fullYear("ZAE_1", 5).filter((day) => day.date.slice(5, 7) === "04");
    const mean = series.reduce((sum, day) => sum + day.tempMaxC, 0) / series.length;
    expect(mean).toBeGreaterThan(35);
  });
});

describe("scénarios", () => {
  const base = fullYear("ZAE_5", 21);

  it("applyDrySpell annule la pluie sur la période et relève la maximale de 3 °C", () => {
    const series = applyDrySpell(base, "2025-07-10", 10);
    const episode = series.filter((day) => day.date >= "2025-07-10" && day.date <= "2025-07-19");
    expect(episode).toHaveLength(10);
    expect(episode.reduce((sum, day) => sum + day.precipitationMm, 0)).toBe(0);
    expect(dayAt(episode, 0).tempMaxC).toBeCloseTo(dayAt(base, 190).tempMaxC + 3, 1);
    // Hors épisode, rien ne change et la série d'origine n'est pas modifiée.
    expect(dayAt(series, 0)).toEqual(dayAt(base, 0));
    expect(dayAt(series, 200)).toEqual(dayAt(base, 200));
    expect(dayAt(base, 190).precipitationMm).toBe(
      dayAt(fullYear("ZAE_5", 21), 190).precipitationMm,
    );
  });

  it("applyHeatWave impose une maximale d'au moins 36 °C par défaut", () => {
    const series = applyHeatWave(base, "2025-08-01", 5);
    const episode = series.slice(212, 217);
    expect(dayAt(episode, 0).date).toBe("2025-08-01");
    for (const day of episode) {
      expect(day.tempMaxC).toBeGreaterThanOrEqual(36);
      expect(day.tempMaxC - day.tempMinC).toBeGreaterThanOrEqual(4);
    }
    const custom = applyHeatWave(base, "2025-08-01", 5, 40);
    expect(dayAt(custom, 212).tempMaxC).toBeGreaterThanOrEqual(40);
  });

  it("applyFloodEpisode répartit exactement le cumul demandé", () => {
    const series = applyFloodEpisode(base, "2025-09-05", 4, 180);
    const episode = series.filter((day) => day.date >= "2025-09-05" && day.date <= "2025-09-08");
    expect(episode.reduce((sum, day) => sum + day.precipitationMm, 0)).toBeCloseTo(180, 1);
    // Profil triangulaire : les jours centraux reçoivent plus que les extrémités.
    expect(dayAt(episode, 1).precipitationMm).toBeGreaterThan(dayAt(episode, 0).precipitationMm);
    expect(dayAt(episode, 2).precipitationMm).toBeGreaterThan(dayAt(episode, 3).precipitationMm);
    expect(episode.every((day) => day.relativeHumidityPct === 95)).toBe(true);
  });

  it("tronque un épisode qui dépasse la fin de la série et refuse une date absente", () => {
    const series = applyDrySpell(base, "2025-12-28", 10);
    expect(series).toHaveLength(base.length);
    expect(series.slice(361).every((day) => day.precipitationMm === 0)).toBe(true);
    expect(() => applyDrySpell(base, "2026-01-01", 3)).toThrow(RangeError);
    expect(() => applyFloodEpisode(base, "2025-01-01", 3, 0)).toThrow(RangeError);
  });

  it("enchaîne les scénarios pour construire un cas d'alerte hydrique", () => {
    // Alerte hydrique attendue : tmax >= 36 °C sur 3 jours et pluie < 5 mm sur 10 jours.
    const series = applyHeatWave(applyDrySpell(base, "2025-03-01", 10), "2025-03-05", 3);
    const window = series.slice(59, 69);
    expect(dayAt(window, 0).date).toBe("2025-03-01");
    expect(window.reduce((sum, day) => sum + day.precipitationMm, 0)).toBeLessThan(5);
    expect(window.slice(4, 7).every((day) => day.tempMaxC >= 36)).toBe(true);
  });
});
