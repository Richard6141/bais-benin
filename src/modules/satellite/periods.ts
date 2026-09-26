import type { BBox } from "@/lib/geo/tile-math";
import type { SceneSummary } from "@/services/ports/remote-sensing-provider";

// Périodes d'imagerie : un mois calendaire (UTC). Chaque image de la carte est la mosaïque des
// scènes les moins nuageuses du mois ; un mois révolu ne change plus, ce qui rend le cache
// définitif. Fonctions pures, sans réseau ni base.

/** Emprise du Bénin interrogée dans le catalogue et rendue en image d'ensemble. */
export const BENIN_IMAGERY_BBOX: BBox = [0.6, 5.9, 4.0, 12.5];

/** Nombre de mois proposés, mois en cours compris. */
export const PERIOD_COUNT = 12;

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Fenêtre glissante des 60 derniers jours : la scène la moins nuageuse de chaque zone sur deux
 * mois comble une partie des trous nuageux d'un mois de saison des pluies. Toujours proposée.
 */
export const ROLLING_PERIOD = "60-jours";
export const ROLLING_DAYS = 60;

export function isPeriod(value: string): boolean {
  return PERIOD_PATTERN.test(value);
}

export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Bornes du mois, la fin plafonnée à `now` pour le mois en cours. */
export function periodRange(period: string, now: Date): { from: string; to: string } {
  if (period === ROLLING_PERIOD) {
    return {
      from: new Date(now.getTime() - ROLLING_DAYS * 86_400_000).toISOString(),
      to: now.toISOString(),
    };
  }
  const match = PERIOD_PATTERN.exec(period);
  if (!match) throw new RangeError(`Période invalide : ${period}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1) - 1000);
  const to = end.getTime() > now.getTime() ? now : end;
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Les `count` derniers mois, du plus récent au plus ancien. */
export function recentPeriods(now: Date, count = PERIOD_COUNT): string[] {
  const periods: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    periods.push(periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
  }
  return periods;
}

/**
 * Vrai si la période fait partie des mois proposés (les PERIOD_COUNT derniers, mois en cours
 * compris). Toute autre période est refusée avant le cache et le quota : sans cette borne, un
 * robot pourrait demander chaque mois de 1900 à 2099 et vider le quota mensuel.
 */
export function isOfferedPeriod(period: string, now: Date): boolean {
  return period === ROLLING_PERIOD || recentPeriods(now).includes(period);
}

/** Vrai si la période reçoit encore de nouveaux passages (cache à échéance). */
export function isCurrentPeriod(period: string, now: Date): boolean {
  return period === ROLLING_PERIOD || period === periodOf(now);
}

/** Libellé français : « septembre 2026 ». */
export function periodLabel(period: string): string {
  if (period === ROLLING_PERIOD) return `${ROLLING_DAYS} derniers jours`;
  const match = PERIOD_PATTERN.exec(period);
  if (!match) throw new RangeError(`Période invalide : ${period}`);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

/** Nébulosité au-dessous de laquelle une scène compte comme dégagée, en pour cent. */
export const CLEAR_SCENE_MAX_CLOUD = 30;

export interface ImageryPeriod {
  period: string;
  label: string;
  current: boolean;
  /** Fenêtre glissante (comblement des nuages) plutôt qu'un mois calendaire. */
  rolling: boolean;
  /** Scènes dégagées du mois (moins de CLEAR_SCENE_MAX_CLOUD % de nuages) sur le pays. */
  clearSceneCount: number;
  /** Scène la plus dégagée du mois. */
  clearest: { acquiredAt: string; cloudCover: number } | null;
  lastAcquiredAt: string | null;
}

/** Résumé d'un mois à partir de ses scènes dégagées (déjà filtrées par le catalogue). */
export function summarizePeriod(period: string, scenes: SceneSummary[], now: Date): ImageryPeriod {
  let clearest: ImageryPeriod["clearest"] = null;
  for (const scene of scenes) {
    if (scene.cloudCover === null) continue;
    if (!clearest || scene.cloudCover < clearest.cloudCover) {
      clearest = { acquiredAt: scene.acquiredAt, cloudCover: scene.cloudCover };
    }
  }
  const lastAcquiredAt = scenes.reduce<string | null>(
    (latest, scene) => (!latest || scene.acquiredAt > latest ? scene.acquiredAt : latest),
    null,
  );
  return {
    period,
    label: periodLabel(period),
    current: period === periodOf(now),
    rolling: period === ROLLING_PERIOD,
    clearSceneCount: scenes.length,
    clearest,
    lastAcquiredAt,
  };
}

// Scènes dégagées au-delà desquelles un mois couvre le pays (une vingtaine de carreaux MGRS).
const READABLE_CLEAR_SCENES = 25;

/**
 * Période proposée par défaut : le mois le plus récent qui couvre le pays de scènes dégagées ;
 * à défaut (saison des pluies), celui des trois derniers mois qui en a le plus ; null sans
 * aucune scène dégagée.
 */
export function defaultPeriod(allPeriods: readonly ImageryPeriod[]): string | null {
  const periods = allPeriods.filter((entry) => !entry.rolling);
  const readable = periods.find((entry) => entry.clearSceneCount >= READABLE_CLEAR_SCENES);
  if (readable) return readable.period;
  const recent = periods.slice(0, 3).filter((entry) => entry.clearSceneCount > 0);
  if (recent.length === 0) return null;
  return recent.reduce((best, entry) =>
    entry.clearSceneCount > best.clearSceneCount ? entry : best,
  ).period;
}
