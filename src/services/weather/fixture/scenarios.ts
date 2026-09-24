/**
 * Épisodes climatiques appliqués sur une série journalière existante.
 *
 * Ces fonctions servent à fabriquer des cas de test pour le moteur de règles (par exemple l'alerte
 * hydrique : maximale supérieure ou égale à 36 °C trois jours de suite et moins de 5 mm de pluie
 * sur dix jours). Elles renvoient toujours une nouvelle série ; la série d'entrée n'est jamais
 * modifiée. L'épisode couvre `days` jours à partir de `from` inclus ; s'il dépasse la fin de la
 * série, il est tronqué. Une date `from` absente de la série est une erreur, car un scénario qui
 * ne s'applique nulle part fausserait silencieusement le test.
 */

import { parseIsoDate, type DailyWeather } from "./synthetic-weather";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Bornes d'un épisode dans la série : premier indice inclus, dernier exclu. */
interface Episode {
  start: number;
  end: number;
  length: number;
}

function locateEpisode(series: readonly DailyWeather[], from: string, days: number): Episode {
  parseIsoDate(from);
  const start = series.findIndex((day) => day.date === from);
  if (start < 0) {
    throw new RangeError(`La date ${from} n'appartient pas à la série`);
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`La durée d'un épisode est un entier positif, reçu ${days}`);
  }
  const end = Math.min(series.length, start + days);
  return { start, end, length: end - start };
}

function mapEpisode(
  series: readonly DailyWeather[],
  episode: Episode,
  transform: (day: DailyWeather, position: number, length: number) => DailyWeather,
): DailyWeather[] {
  return series.map((day, index) =>
    index >= episode.start && index < episode.end
      ? transform(day, index - episode.start, episode.length)
      : { ...day },
  );
}

/**
 * Séquence sèche : aucune pluie, ciel dégagé, maximales relevées de 3 °C, air plus sec et
 * évapotranspiration accrue.
 */
export function applyDrySpell(
  series: readonly DailyWeather[],
  from: string,
  days: number,
): DailyWeather[] {
  return mapEpisode(series, locateEpisode(series, from, days), (day) => ({
    ...day,
    precipitationMm: 0,
    tempMaxC: round(day.tempMaxC + 3, 1),
    relativeHumidityPct: Math.max(15, day.relativeHumidityPct - 10),
    et0Mm: round(day.et0Mm + 0.5, 2),
  }));
}

/**
 * Vague de chaleur : la maximale atteint au moins `tmaxMin` (36 °C par défaut, seuil de l'alerte
 * hydrique) avec un degré de marge, les nuits restent chaudes, l'air est plus sec. Les pluies
 * éventuelles sont conservées : une vague de chaleur n'est pas forcément sèche.
 */
export function applyHeatWave(
  series: readonly DailyWeather[],
  from: string,
  days: number,
  tmaxMin = 36,
): DailyWeather[] {
  return mapEpisode(series, locateEpisode(series, from, days), (day) => {
    const tempMaxC = round(Math.max(day.tempMaxC + 2, tmaxMin + 1), 1);
    return {
      ...day,
      tempMaxC,
      tempMinC: round(Math.min(day.tempMinC + 2, tempMaxC - 4), 1),
      relativeHumidityPct: Math.max(15, day.relativeHumidityPct - 5),
      et0Mm: round(day.et0Mm + 0.4, 2),
    };
  });
}

/**
 * Épisode d'inondation : `totalMm` répartis sur l'épisode selon un profil triangulaire (le cœur
 * de l'épisode reçoit le plus), ciel couvert, humidité saturée, évapotranspiration minimale.
 */
export function applyFloodEpisode(
  series: readonly DailyWeather[],
  from: string,
  days: number,
  totalMm: number,
): DailyWeather[] {
  if (!(totalMm > 0)) {
    throw new RangeError(
      `Le cumul d'un épisode d'inondation est strictement positif, reçu ${totalMm}`,
    );
  }
  const episode = locateEpisode(series, from, days);
  const { length } = episode;
  // Poids triangulaires : 1, 2, …, pic, …, 2, 1 ; leur somme normalise la répartition.
  const weightAt = (position: number): number => Math.min(position + 1, length - position);
  let weightSum = 0;
  for (let position = 0; position < length; position += 1) {
    weightSum += weightAt(position);
  }
  let distributed = 0;

  return mapEpisode(series, episode, (day, position) => {
    // Le dernier jour absorbe l'arrondi pour que la somme fasse exactement totalMm.
    const share =
      position === length - 1
        ? round(totalMm - distributed, 1)
        : round((totalMm * weightAt(position)) / weightSum, 1);
    distributed = round(distributed + share, 1);
    return {
      ...day,
      precipitationMm: share,
      tempMaxC: round(day.tempMaxC - 2, 1),
      relativeHumidityPct: 95,
      et0Mm: 1.2,
      windKmh: round(Math.max(day.windKmh, 15), 1),
    };
  });
}
