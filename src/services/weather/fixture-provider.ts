import type { WeatherProvider, WeatherRequest } from "@/services/ports/weather-provider";
import {
  ZONE_CODES,
  formatIsoDate,
  generateDailyWeather,
  parseIsoDate,
  type ZoneCode,
} from "./fixture";

// Adaptateur fixture : séries synthétiques déterministes par zone agro-écologique. Sert à la
// démonstration sans réseau et aux tests ; toute donnée produite est marquée SYNTHETIC.

const DAY_MS = 86_400_000;
const DEFAULT_ZONE: ZoneCode = ZONE_CODES[0];

function isZoneCode(value: string | null | undefined): value is ZoneCode {
  return value !== null && value !== undefined && (ZONE_CODES as readonly string[]).includes(value);
}

export function createFixtureWeatherProvider(options: { seed?: number } = {}): WeatherProvider {
  const seed = options.seed ?? 2026;
  return {
    id: "fixture",
    provenance: {
      sourceId: "BAIS_SEED",
      reliability: "SYNTHETIC",
      licence: "Données de démonstration",
    },
    async fetchDaily(request: WeatherRequest) {
      const today = parseIsoDate(request.today).getTime();
      const from = formatIsoDate(new Date(today - request.pastDays * DAY_MS));
      const to = formatIsoDate(new Date(today + (request.forecastDays - 1) * DAY_MS));
      return request.locations.map((location) => ({
        key: location.key,
        days: generateDailyWeather({
          zoneCode: isZoneCode(location.zoneCode) ? location.zoneCode : DEFAULT_ZONE,
          latitude: location.latitude,
          longitude: location.longitude,
          from,
          to,
          seed,
          forecastFrom: request.today,
        }).map((day) => ({
          date: day.date,
          kind: day.kind,
          tempMaxC: day.tempMaxC,
          tempMinC: day.tempMinC,
          precipitationMm: day.precipitationMm,
          et0Mm: day.et0Mm,
          relativeHumidityPct: day.relativeHumidityPct,
          windKmh: day.windKmh,
        })),
      }));
    },
  };
}
