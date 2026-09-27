import { createHash } from "node:crypto";

// Prévention de la saison des feux (ADR-0038 §3), en fonctions pures : saison, communes les plus
// touchées, semaine d'envoi et identifiant stable du message de la semaine pour un producteur.

/** Saison sèche : de novembre à avril, là où tombent l'essentiel des détections. */
export const FIRE_SEASON_MONTHS: readonly number[] = [11, 12, 1, 2, 3, 4];
/** Densité minimale, en détections pour 100 km² sur la saison de référence. */
export const MIN_DENSITY_PER_100KM2 = 5;
/** Part des communes retenues : le tiers le plus touché. */
export const MOST_AFFECTED_SHARE = 1 / 3;

export const FIRE_PREVENTION_TEXT =
  "BAIS, saison des feux : faites vos pare-feu autour des champs et des greniers, ne brûlez pas par grand vent, prévenez vos voisins avant un brûlis. Feu dangereux : 118.";

/** Date au Bénin (UTC+1, sans heure d'été) : année, mois (1 à 12), jour, jour de la semaine. */
function beninParts(date: Date) {
  const local = new Date(date.getTime() + 3_600_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}

export function isFireSeason(date: Date): boolean {
  return FIRE_SEASON_MONTHS.includes(beninParts(date).month);
}

/** Minuit au Bénin, en UTC : 23 h la veille. */
function beninMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - 3_600_000);
}

/**
 * Saison en cours (depuis le 1er novembre) et saison passée (du 1er novembre au 1er mai), pour une
 * date de la saison sèche.
 */
export function fireSeasons(date: Date): {
  current: { from: Date; to: Date };
  previous: { from: Date; to: Date };
} {
  const { year, month } = beninParts(date);
  const startYear = month >= 11 ? year : year - 1;
  return {
    current: { from: beninMidnight(startYear, 11, 1), to: date },
    previous: {
      from: beninMidnight(startYear - 1, 11, 1),
      to: beninMidnight(startYear, 5, 1),
    },
  };
}

/** Lundi de la semaine au Bénin, « AAAA-MM-JJ » : un seul message par producteur et par semaine. */
export function weekKey(date: Date): string {
  const { year, month, day, weekday } = beninParts(date);
  const monday = new Date(Date.UTC(year, month - 1, day - ((weekday + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/**
 * Identifiant stable du message d'une semaine pour un producteur, au format UUID (empreinte
 * SHA-1, version 5) : relancer la tâche la même semaine ne met rien de plus en file.
 */
export function preventionSubjectId(farmerId: string, week: string): string {
  const hex = createHash("sha1").update(`fire-prevention:${farmerId}:${week}`).digest("hex");
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export interface CommuneFires {
  commune_id: string;
  area_km2: number;
  detections: number;
}

/**
 * Communes du tiers le plus touché par les feux, avec au moins 5 détections pour 100 km², de la
 * plus touchée à la moins touchée.
 */
export function mostAffectedCommunes(rows: readonly CommuneFires[]): string[] {
  const ranked = rows
    .filter((row) => row.area_km2 > 0)
    .map((row) => ({ id: row.commune_id, density: (row.detections / row.area_km2) * 100 }))
    .sort((a, b) => b.density - a.density);
  const kept = Math.ceil(ranked.length * MOST_AFFECTED_SHARE);
  return ranked
    .slice(0, kept)
    .filter((row) => row.density >= MIN_DENSITY_PER_100KM2)
    .map((row) => row.id);
}
