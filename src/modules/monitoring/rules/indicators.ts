import type { IndicatorValues } from "./definition";

// Calcul des indicateurs d'une commune à une date de référence, à partir des observations
// météo (jusqu'à la date incluse) et des prévisions (après la date). Fonctions pures : aucune
// base, aucun réseau. Les séries peuvent arriver non triées, avec doublons ou trous :
// - un doublon de date garde la dernière valeur reçue ;
// - une fenêtre de cumul n'est calculée que si 80 % au moins de ses jours sont présents, sinon
//   l'indicateur vaut null (un cumul de pluie sur une série trouée sous-estimerait la pluie et
//   déclencherait à tort une alerte de sécheresse) ;
// - les jours manquants des 30 derniers jours sont exposés dans `observed_days_missing_30d`.

/** Journée météo minimale : DailyWeather (fixtures) et WeatherObservation s'y conforment. */
export interface WeatherDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  et0Mm: number;
}

export interface CropPresence {
  cropCode: string;
  stage: string;
}

export interface IndicatorInput {
  observed: readonly WeatherDay[];
  forecast: readonly WeatherDay[];
  /** Date de référence AAAA-MM-JJ, dernier jour observé pris en compte. */
  referenceDate: string;
  zoneCode: string | null;
  crops: readonly CropPresence[];
}

const DAY_MS = 86_400_000;
const MIN_COVERAGE = 0.8;
/** Seuil d'un jour sec, en millimètres (convention agro-climatique usuelle). */
export const DRY_DAY_THRESHOLD_MM = 1;

function toTime(date: string): number {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time)) throw new RangeError(`Date invalide : « ${date} »`);
  return time;
}

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function byDate(series: readonly WeatherDay[]): Map<string, WeatherDay> {
  const map = new Map<string, WeatherDay>();
  for (const day of series) map.set(day.date.slice(0, 10), day);
  return map;
}

/** Jours présents d'une fenêtre de `days` jours se terminant à `endTime` inclus. */
function window(map: Map<string, WeatherDay>, endTime: number, days: number): WeatherDay[] {
  const out: WeatherDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = map.get(isoDay(endTime - offset * DAY_MS));
    if (day) out.push(day);
  }
  return out;
}

function covered(present: readonly WeatherDay[], days: number): boolean {
  return present.length >= Math.ceil(days * MIN_COVERAGE);
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sum(days: readonly WeatherDay[], pick: (d: WeatherDay) => number): number {
  return days.reduce((total, d) => total + pick(d), 0);
}

function windowSum(
  map: Map<string, WeatherDay>,
  endTime: number,
  days: number,
  pick: (d: WeatherDay) => number,
): number | null {
  const present = window(map, endTime, days);
  return covered(present, days) ? round(sum(present, pick)) : null;
}

function windowAvg(
  map: Map<string, WeatherDay>,
  endTime: number,
  days: number,
  pick: (d: WeatherDay) => number,
): number | null {
  const present = window(map, endTime, days);
  return covered(present, days) ? round(sum(present, pick) / present.length) : null;
}

function windowMax(
  map: Map<string, WeatherDay>,
  endTime: number,
  days: number,
  pick: (d: WeatherDay) => number,
): number | null {
  const present = window(map, endTime, days);
  return covered(present, days) ? round(Math.max(...present.map(pick))) : null;
}

/** Jours secs consécutifs jusqu'à la date de référence ; s'arrête au premier jour manquant. */
function dryDays(map: Map<string, WeatherDay>, endTime: number): number | null {
  if (!map.has(isoDay(endTime))) return null;
  let count = 0;
  for (let offset = 0; offset < 366; offset += 1) {
    const day = map.get(isoDay(endTime - offset * DAY_MS));
    if (!day || day.precipitationMm >= DRY_DAY_THRESHOLD_MM) break;
    count += 1;
  }
  return count;
}

export function computeIndicators(input: IndicatorInput): IndicatorValues {
  const refTime = toTime(input.referenceDate);
  const observed = byDate(input.observed.filter((d) => toTime(d.date.slice(0, 10)) <= refTime));
  const forecast = byDate(input.forecast.filter((d) => toTime(d.date.slice(0, 10)) > refTime));
  const forecastEnd = refTime + 3 * DAY_MS;

  const rain = (d: WeatherDay) => d.precipitationMm;
  const tmax = (d: WeatherDay) => d.tempMaxC;
  const rain10 = windowSum(observed, refTime, 10, rain);
  const et010 = windowSum(observed, refTime, 10, (d) => d.et0Mm);

  const stages = [...new Set(input.crops.map((c) => c.stage))].sort();
  const cropCodes = [...new Set(input.crops.map((c) => c.cropCode))].sort();

  return {
    temp_max_avg_3d: windowAvg(observed, refTime, 3, tmax),
    temp_max_max_3d: windowMax(observed, refTime, 3, tmax),
    temp_min_avg_3d: windowAvg(observed, refTime, 3, (d) => d.tempMinC),
    rain_sum_3d: windowSum(observed, refTime, 3, rain),
    rain_sum_7d: windowSum(observed, refTime, 7, rain),
    rain_sum_10d: rain10,
    rain_sum_30d: windowSum(observed, refTime, 30, rain),
    // Plus forte pluie journalière des trois derniers jours : un orage de la veille compte encore.
    rain_max_1d: windowMax(observed, refTime, 3, rain),
    dry_days_consecutive: dryDays(observed, refTime),
    et0_sum_7d: windowSum(observed, refTime, 7, (d) => d.et0Mm),
    water_balance_10d: rain10 === null || et010 === null ? null : round(rain10 - et010),
    forecast_rain_sum_3d: windowSum(forecast, forecastEnd, 3, rain),
    forecast_temp_max_max_3d: windowMax(forecast, forecastEnd, 3, tmax),
    month: new Date(refTime).getUTCMonth() + 1,
    observed_days_missing_30d: 30 - window(observed, refTime, 30).length,
    zae_in: input.zoneCode,
    crop_in: cropCodes,
    crop_stage_in: stages,
    // Dépend des paramètres de chaque condition : calculé à part (evaluation.ts, ADR-0015).
    report_cluster: null,
    // Dépend des détections de feux des dernières 24 heures : calculé à part (ADR-0022).
    fire_near_parcels: null,
  };
}
