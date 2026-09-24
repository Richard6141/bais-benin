/**
 * Génération déterministe de séries météo journalières à partir des profils climatiques.
 *
 * Principe : chaque jour, les normales du mois sont interpolées linéairement entre les milieux de
 * mois voisins (pas de marche d'escalier au 1er du mois), puis un tirage décide s'il pleut selon
 * la fréquence mensuelle de jours de pluie ; le cumul d'un jour pluvieux suit une loi log-normale
 * dont l'espérance reproduit le cumul mensuel moyen. Températures, ET0 et humidité reçoivent un
 * bruit borné et sont corrigées les jours de pluie (ciel couvert : maximale plus basse, ET0 plus
 * faible, air plus humide). Une même graine, une même zone et un même lieu redonnent toujours la
 * même série.
 */

import { getClimateProfile, type MonthlyClimate, type ZoneCode } from "./climate-profiles";
import { combineSeed, mulberry32, type RandomSource } from "./random";

export type WeatherKind = "OBSERVED" | "FORECAST";

export interface DailyWeather {
  /** Date au format AAAA-MM-JJ. */
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  et0Mm: number;
  relativeHumidityPct: number;
  windKmh: number;
  kind: WeatherKind;
  sourceId: "BAIS_SEED";
  reliability: "ESTIMATED";
}

export interface GenerateDailyWeatherOptions {
  zoneCode: ZoneCode;
  /** Coordonnées du point (centroïde de commune) : elles individualisent la graine du lieu. */
  latitude: number;
  longitude: number;
  /** Premier jour inclus, AAAA-MM-JJ. */
  from: string;
  /** Dernier jour inclus, AAAA-MM-JJ. */
  to: string;
  seed: number;
  /** À partir de cette date incluse, les jours sont marqués FORECAST ; sinon tout est OBSERVED. */
  forecastFrom?: string;
}

const DAY_MS = 86_400_000;
/** Écart-type logarithmique des cumuls journaliers : quelques fortes averses, beaucoup de petites. */
const RAIN_SIGMA = 0.65;
const MAX_DAILY_RAIN_MM = 150;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Date invalide : « ${value} » (format attendu AAAA-MM-JJ)`);
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime()) || formatIsoDate(date) !== value) {
    throw new RangeError(`Date invalide : « ${value} »`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Accès garanti à un mois du profil : un profil incomplet est une erreur de données, pas un jour vide. */
function monthAt(months: readonly MonthlyClimate[], index: number): MonthlyClimate {
  const month = months[index];
  if (!month) {
    throw new RangeError(`Profil climatique incomplet : mois ${index + 1} absent`);
  }
  return month;
}

interface DrawnDay {
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  et0Mm: number;
  relativeHumidityPct: number;
  windKmh: number;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normales interpolées pour un jour donné. La position du jour dans le mois (0 au premier jour,
 * 1 au dernier) place la valeur entre le milieu du mois précédent, du mois courant et du suivant.
 */
function interpolateMonth(months: readonly MonthlyClimate[], date: Date): MonthlyClimate {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const length = daysInMonth(year, monthIndex);
  const position = (date.getUTCDate() - 0.5) / length;

  const neighbourIndex = position < 0.5 ? (monthIndex + 11) % 12 : (monthIndex + 1) % 12;
  const current = monthAt(months, monthIndex);
  const neighbour = monthAt(months, neighbourIndex);
  const neighbourWeight = position < 0.5 ? 0.5 - position : position - 0.5;
  const currentWeight = 1 - neighbourWeight;

  const blend = (key: keyof MonthlyClimate): number =>
    current[key] * currentWeight + neighbour[key] * neighbourWeight;

  // Les cumuls et jours de pluie sont ramenés à l'échelle du jour avant interpolation.
  const perDay = (key: "rainMm" | "rainDays", entry: MonthlyClimate, index: number): number =>
    entry[key] / daysInMonth(year, index);

  return {
    rainMm:
      perDay("rainMm", current, monthIndex) * currentWeight +
      perDay("rainMm", neighbour, neighbourIndex) * neighbourWeight,
    rainDays:
      perDay("rainDays", current, monthIndex) * currentWeight +
      perDay("rainDays", neighbour, neighbourIndex) * neighbourWeight,
    tmaxC: blend("tmaxC"),
    tminC: blend("tminC"),
    et0MmPerDay: blend("et0MmPerDay"),
    humidityPct: blend("humidityPct"),
  };
}

/** Tire un jour à partir des normales journalières (`rainMm` et `rainDays` sont ici par jour). */
function drawDay(normals: MonthlyClimate, random: RandomSource, monthIndex: number): DrawnDay {
  const wetProbability = clamp(normals.rainDays, 0, 0.95);
  const isWet = wetProbability > 0 && random.chance(wetProbability);

  let precipitation = 0;
  if (isWet) {
    const meanPerWetDay = Math.max(0.5, normals.rainMm / wetProbability);
    precipitation = clamp(random.logNormal(meanPerWetDay, RAIN_SIGMA), 0.5, MAX_DAILY_RAIN_MM);
  }

  const cloudCooling = isWet ? 1 + Math.min(3, precipitation / 25) : 0;
  const tempMax = normals.tmaxC + clamp(random.normal() * 1.1, -2, 2) - cloudCooling;
  let tempMin = normals.tminC + clamp(random.normal() * 0.8, -1.5, 1.5) - (isWet ? 0.5 : 0);
  if (tempMax - tempMin < 4) {
    tempMin = tempMax - 4;
  }

  const et0 = clamp(
    normals.et0MmPerDay + random.uniform(-0.3, 0.3) - (isWet ? 0.8 + precipitation / 60 : 0),
    1.2,
    9,
  );

  const humidity = clamp(normals.humidityPct + random.uniform(-5, 5) + (isWet ? 8 : 0), 15, 100);

  // Vent : brise de fond, harmattan renforcé en saison sèche (air sec de décembre à février),
  // rafales d'orage les jours de pluie.
  const isHarmattanSeason = monthIndex === 11 || monthIndex <= 1;
  const harmattan = isHarmattanSeason && humidity < 40 ? 6 : 0;
  const wind = clamp(9 + harmattan + (isWet ? 4 : 0) + random.uniform(-3, 3), 2, 40);

  return {
    tempMaxC: round(tempMax, 1),
    tempMinC: round(tempMin, 1),
    precipitationMm: round(precipitation, 1),
    et0Mm: round(et0, 2),
    relativeHumidityPct: round(humidity, 0),
    windKmh: round(wind, 1),
  };
}

export function generateDailyWeather(options: GenerateDailyWeatherOptions): DailyWeather[] {
  const { zoneCode, latitude, longitude, seed, forecastFrom } = options;
  const start = parseIsoDate(options.from);
  const end = parseIsoDate(options.to);
  if (end < start) {
    throw new RangeError(`La date de fin ${options.to} précède la date de début ${options.from}`);
  }

  const profile = getClimateProfile(zoneCode);
  const locationKey = `${zoneCode}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const random = mulberry32(combineSeed(seed, locationKey));
  const forecastStart = forecastFrom
    ? parseIsoDate(forecastFrom).getTime()
    : Number.POSITIVE_INFINITY;

  const series: DailyWeather[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const date = new Date(time);
    const normals = interpolateMonth(profile.months, date);
    series.push({
      date: formatIsoDate(date),
      ...drawDay(normals, random, date.getUTCMonth()),
      kind: time >= forecastStart ? "FORECAST" : "OBSERVED",
      sourceId: "BAIS_SEED",
      reliability: "ESTIMATED",
    });
  }
  return series;
}

/** Cumul de précipitations d'une série, en millimètres. */
export function totalPrecipitation(series: readonly DailyWeather[]): number {
  return round(
    series.reduce((total, day) => total + day.precipitationMm, 0),
    1,
  );
}

/** Cumuls mensuels d'une série, indexés par « AAAA-MM ». */
export function monthlyPrecipitation(series: readonly DailyWeather[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const day of series) {
    const key = day.date.slice(0, 7);
    totals.set(key, round((totals.get(key) ?? 0) + day.precipitationMm, 1));
  }
  return totals;
}
