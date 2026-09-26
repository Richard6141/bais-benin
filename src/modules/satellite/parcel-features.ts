// Variables d'une parcelle pour le modèle de culture (ADR-0030), tirées de ses séries satellite :
// NDVI et NDMI Sentinel-2 par décade, VV et VH Sentinel-1 par pas de 12 jours. Fonctions pures.
//
// La fenêtre part du 1er janvier de l'année de campagne : la saison sèche avant semis et la
// contre-saison comptent autant que la saison des pluies pour distinguer les cultures. Les mois pas
// encore observés valent MISSING : le modèle est entraîné et appliqué à la même date de lecture.

/** Version des variables : à changer avec la liste ou le calcul, pour ne pas mêler deux modèles. */
export const FEATURE_VERSION = 1;
/** Valeur des mois pas encore lus (ou jamais vus sans nuage). */
export const MISSING = -1;
/** Quinze mois : de janvier de l'année de campagne à mars de la suivante. */
export const WINDOW_MONTHS = 15;
const DECADE_DAYS = 10;
const DAY_MS = 86_400_000;
/** Part minimale de pixels sans nuage pour qu'une décade compte. */
const MIN_VALID_SHARE = 0.5;

export interface S2Decade {
  /** Début de la décade, ISO 8601. */
  from: string;
  ndvi: number | null;
  ndmi: number | null;
  /** Part des pixels de la parcelle vus sans nuage, de 0 à 1. */
  valid: number;
}

export interface S1Step {
  from: string;
  /** Rétrodiffusion en décibels. */
  vv: number | null;
  vh: number | null;
}

export interface ParcelSeries {
  windowFrom: Date;
  observedUntil: Date;
  s2: S2Decade[];
  s1: S1Step[];
}

/** Début de la fenêtre : le 1er janvier de l'année où commence la campagne. */
export function signatureWindowStart(campaignStartsOn: Date): Date {
  return new Date(Date.UTC(campaignStartsOn.getUTCFullYear(), 0, 1));
}

function monthIndex(windowFrom: Date, date: Date): number {
  return (
    (date.getUTCFullYear() - windowFrom.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    windowFrom.getUTCMonth()
  );
}

/** Série régulière par décade, trous comblés par interpolation linéaire entre valeurs vues. */
export function fillDecades(
  decades: readonly S2Decade[],
  key: "ndvi" | "ndmi",
  windowFrom: Date,
  observedUntil: Date,
): (number | null)[] {
  const count = Math.max(
    0,
    Math.floor((observedUntil.getTime() - windowFrom.getTime()) / (DECADE_DAYS * DAY_MS)) + 1,
  );
  const values: (number | null)[] = new Array(count).fill(null);
  for (const decade of decades) {
    const index = Math.floor(
      (Date.parse(decade.from) - windowFrom.getTime()) / (DECADE_DAYS * DAY_MS),
    );
    const value = decade[key];
    if (index < 0 || index >= count || value === null || decade.valid < MIN_VALID_SHARE) continue;
    values[index] = value;
  }
  const known = values.flatMap((value, index) => (value === null ? [] : [index]));
  if (known.length === 0) return values;
  return values.map((value, index) => {
    if (value !== null) return value;
    const before = known.filter((position) => position < index).at(-1);
    const after = known.find((position) => position > index);
    if (before === undefined) return values[after!]!;
    if (after === undefined) return values[before]!;
    const weight = (index - before) / (after - before);
    return values[before]! + (values[after]! - values[before]!) * weight;
  });
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? MISSING
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthly(
  values: readonly (number | null)[],
  windowFrom: Date,
  dateOf: (index: number) => Date,
): number[] {
  const months: number[][] = Array.from({ length: WINDOW_MONTHS }, () => []);
  values.forEach((value, index) => {
    if (value === null) return;
    const month = monthIndex(windowFrom, dateOf(index));
    if (month >= 0 && month < WINDOW_MONTHS) months[month]!.push(value);
  });
  return months.map((entries) => round(mean(entries)));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const pad = (index: number) => String(index).padStart(2, "0");

/** Noms des variables, dans l'ordre du vecteur donné au modèle. */
export const FEATURE_NAMES: readonly string[] = [
  ...Array.from({ length: WINDOW_MONTHS }, (_, month) => `ndvi_m${pad(month)}`),
  ...Array.from({ length: WINDOW_MONTHS }, (_, month) => `ndmi_m${pad(month)}`),
  ...Array.from({ length: WINDOW_MONTHS }, (_, month) => `vh_m${pad(month)}`),
  ...Array.from({ length: WINDOW_MONTHS }, (_, month) => `vv_m${pad(month)}`),
  "ndvi_max",
  "ndvi_peak_decade",
  "ndvi_min_before_june",
  "ndvi_amplitude",
  "ndvi_integral",
  "greenup_rate",
  "senescence_rate",
  "green_share",
  "dry_season_mean",
  "s2_valid_share",
  "ndmi_max",
  "flood_decades",
  "vh_max",
  "vh_min",
  "vh_rise",
  "vh_minus_vv",
];

/** Variables d'une parcelle, par nom ; toujours toutes présentes (MISSING si inconnues). */
export function parcelFeatures(series: ParcelSeries): Record<string, number> {
  const { windowFrom, observedUntil } = series;
  const decadeDate = (index: number) =>
    new Date(windowFrom.getTime() + index * DECADE_DAYS * DAY_MS);
  const ndvi = fillDecades(series.s2, "ndvi", windowFrom, observedUntil);
  const ndmi = fillDecades(series.s2, "ndmi", windowFrom, observedUntil);
  const s1 = [...series.s1]
    .filter((step) => Date.parse(step.from) <= observedUntil.getTime())
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const vh = s1.map((step) => step.vh);
  const vv = s1.map((step) => step.vv);
  const stepDate = (index: number) => new Date(s1[index]!.from);

  const features: Record<string, number> = {};
  const put = (prefix: string, values: number[]) =>
    values.forEach((value, month) => {
      features[`${prefix}_m${pad(month)}`] = value;
    });
  put("ndvi", monthly(ndvi, windowFrom, decadeDate));
  put("ndmi", monthly(ndmi, windowFrom, decadeDate));
  put("vh", monthly(vh, windowFrom, stepDate));
  put("vv", monthly(vv, windowFrom, stepDate));

  const seen = ndvi.filter((value): value is number => value !== null);
  const max = seen.length > 0 ? Math.max(...seen) : MISSING;
  const peak = seen.length > 0 ? ndvi.indexOf(max) : MISSING;
  const beforeJune = ndvi
    .slice(0, Math.max(0, Math.floor((151 * DAY_MS) / (DECADE_DAYS * DAY_MS))))
    .filter((value): value is number => value !== null);
  let greenup = 0;
  let senescence = 0;
  for (let index = 3; index < ndvi.length; index += 1) {
    const now = ndvi[index];
    const earlier = ndvi[index - 3];
    if (now === null || now === undefined || earlier === null || earlier === undefined) continue;
    greenup = Math.max(greenup, now - earlier);
    senescence = Math.max(senescence, earlier - now);
  }
  const drySeason = ndvi
    .map((value, index) => ({ value, month: decadeDate(index).getUTCMonth() }))
    .filter((entry) => entry.value !== null && entry.month <= 2)
    .map((entry) => entry.value as number);
  const observedDecades = ndvi.length;
  const validDecades = series.s2.filter(
    (decade) => decade.valid >= MIN_VALID_SHARE && decade.ndvi !== null,
  ).length;
  const flood = ndvi.filter((value, index) => {
    const moisture = ndmi[index];
    return (
      value !== null &&
      moisture !== null &&
      moisture !== undefined &&
      value <= 0.35 &&
      moisture + 0.05 >= value
    );
  }).length;
  const vhSeen = vh.filter((value): value is number => value !== null);
  let vhRise = 0;
  for (let index = 2; index < vh.length; index += 1) {
    const now = vh[index];
    const earlier = vh[index - 2];
    if (now !== null && now !== undefined && earlier !== null && earlier !== undefined) {
      vhRise = Math.max(vhRise, now - earlier);
    }
  }
  const differences = s1.flatMap((step) =>
    step.vh !== null && step.vv !== null ? [step.vh - step.vv] : [],
  );
  const ndmiSeen = ndmi.filter((value): value is number => value !== null);

  Object.assign(features, {
    ndvi_max: round(max),
    ndvi_peak_decade: peak === MISSING ? MISSING : round(peak / 45),
    ndvi_min_before_june: beforeJune.length > 0 ? round(Math.min(...beforeJune)) : MISSING,
    ndvi_amplitude: seen.length > 0 ? round(max - Math.min(...seen)) : MISSING,
    ndvi_integral:
      seen.length > 0 ? round(mean(seen.map((value) => Math.max(0, value - 0.2)))) : MISSING,
    greenup_rate: round(greenup),
    senescence_rate: round(senescence),
    green_share:
      observedDecades > 0
        ? round(seen.filter((value) => value >= 0.5).length / observedDecades)
        : MISSING,
    dry_season_mean: round(mean(drySeason)),
    s2_valid_share: observedDecades > 0 ? round(validDecades / observedDecades) : 0,
    ndmi_max: ndmiSeen.length > 0 ? round(Math.max(...ndmiSeen)) : MISSING,
    flood_decades: flood,
    vh_max: vhSeen.length > 0 ? round(Math.max(...vhSeen)) : MISSING,
    vh_min: vhSeen.length > 0 ? round(Math.min(...vhSeen)) : MISSING,
    vh_rise: round(vhRise),
    vh_minus_vv: round(mean(differences)),
  });
  return features;
}

/** Vecteur dans l'ordre de FEATURE_NAMES, pour le modèle. */
export function featureVector(features: Record<string, number>): number[] {
  return FEATURE_NAMES.map((name) => features[name] ?? MISSING);
}

/** Série complétée : les pas déjà connus avant le nouveau morceau, puis le nouveau morceau. */
export function mergeSeries<T extends { from: string }>(
  known: readonly T[],
  fresh: readonly T[],
  freshFrom: Date,
): T[] {
  return [...known.filter((step) => Date.parse(step.from) < freshFrom.getTime()), ...fresh].sort(
    (a, b) => Date.parse(a.from) - Date.parse(b.from),
  );
}
