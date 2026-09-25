import { describe, expect, it } from "vitest";

import { computeIndicators, type WeatherDay } from "..";

// Série construite à la main : valeurs exactes, pour vérifier chaque indicateur.
function day(date: string, rain: number, tmax = 32, tmin = 22, et0 = 5): WeatherDay {
  return { date, tempMaxC: tmax, tempMinC: tmin, precipitationMm: rain, et0Mm: et0 };
}

function daysUntil(end: string, count: number, make: (date: string, index: number) => WeatherDay) {
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(endTime - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return make(date, i);
  });
}

describe("computeIndicators", () => {
  // 30 jours jusqu'au 30 juin : 2 mm par jour, sauf les 12 derniers jours secs et un orage de
  // 40 mm le 18 juin ; maximales de 30 °C, sauf 37, 38 et 39 °C les trois derniers jours.
  const observed = daysUntil("2026-06-30", 30, (date, i) => {
    const rain = i >= 18 ? 0 : date === "2026-06-18" ? 40 : 2;
    const tmax = i === 27 ? 37 : i === 28 ? 38 : i === 29 ? 39 : 30;
    return day(date, rain, tmax);
  });
  const forecast = [day("2026-07-01", 10, 33), day("2026-07-02", 25, 35), day("2026-07-03", 5, 31)];

  it("calcule cumuls, moyennes, maxima et jours secs à la date de référence", () => {
    const values = computeIndicators({
      observed,
      forecast,
      referenceDate: "2026-06-30",
      zoneCode: "ZAE_5",
      crops: [
        { cropCode: "MAIZE", stage: "GROWING" },
        { cropCode: "YAM", stage: "SOWN" },
        { cropCode: "MAIZE", stage: "SOWN" },
      ],
    });
    expect(values).toMatchObject({
      temp_max_avg_3d: 38,
      temp_max_max_3d: 39,
      temp_min_avg_3d: 22,
      rain_sum_3d: 0,
      rain_sum_7d: 0,
      rain_sum_10d: 0,
      // 17 jours à 2 mm + l'orage de 40 mm.
      rain_sum_30d: 74,
      rain_max_1d: 0,
      dry_days_consecutive: 12,
      et0_sum_7d: 35,
      water_balance_10d: -50,
      forecast_rain_sum_3d: 40,
      forecast_temp_max_max_3d: 35,
      month: 6,
      observed_days_missing_30d: 0,
      zae_in: "ZAE_5",
      crop_in: ["MAIZE", "YAM"],
      crop_stage_in: ["GROWING", "SOWN"],
    });
  });

  it("tolère une série non triée et des doublons (dernière valeur retenue)", () => {
    const shuffled = [...observed].reverse();
    shuffled.push(day("2026-06-30", 12));
    const values = computeIndicators({
      observed: shuffled,
      forecast: [],
      referenceDate: "2026-06-30",
      zoneCode: null,
      crops: [],
    });
    expect(values.rain_sum_3d).toBe(12);
    expect(values.dry_days_consecutive).toBe(0);
    expect(values.forecast_rain_sum_3d).toBeNull();
    expect(values.crop_in).toEqual([]);
    expect(values.zae_in).toBeNull();
  });

  it("ignore les observations postérieures à la date et les prévisions antérieures", () => {
    const values = computeIndicators({
      observed: [...observed, day("2026-07-01", 80)],
      forecast: [day("2026-06-30", 99), ...forecast],
      referenceDate: "2026-06-30",
      zoneCode: "ZAE_5",
      crops: [],
    });
    expect(values.rain_sum_3d).toBe(0);
    expect(values.forecast_rain_sum_3d).toBe(40);
  });

  it("met à null une fenêtre trop trouée et compte les jours manquants", () => {
    // 4 jours absents sur les 10 derniers : couverture 60 %, sous le seuil de 80 %.
    const gappy = observed.filter(
      (d) => !["2026-06-21", "2026-06-23", "2026-06-25", "2026-06-27"].includes(d.date),
    );
    const values = computeIndicators({
      observed: gappy,
      forecast: [],
      referenceDate: "2026-06-30",
      zoneCode: "ZAE_5",
      crops: [],
    });
    expect(values.observed_days_missing_30d).toBe(4);
    expect(values.rain_sum_10d).toBeNull();
    expect(values.water_balance_10d).toBeNull();
    // Trois jours sur trois présents : la fenêtre courte reste calculée.
    expect(values.rain_sum_3d).toBe(0);
    // Le décompte des jours secs s'arrête au premier jour manquant (le 27).
    expect(values.dry_days_consecutive).toBe(3);
    // 26 jours sur 30 (87 %) : le cumul mensuel reste calculé.
    expect(values.rain_sum_30d).not.toBeNull();
  });

  it("renvoie null pour les jours secs quand la date de référence elle-même manque", () => {
    const values = computeIndicators({
      observed: observed.slice(0, -1),
      forecast: [],
      referenceDate: "2026-06-30",
      zoneCode: "ZAE_5",
      crops: [],
    });
    expect(values.dry_days_consecutive).toBeNull();
    // Deux jours sur trois : fenêtre courte non couverte.
    expect(values.rain_max_1d).toBeNull();
  });
});
