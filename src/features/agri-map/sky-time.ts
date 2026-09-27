// Mois de la vue du ciel rangés du plus ancien au plus récent, pour le curseur temporel : la
// fenêtre glissante (60 jours) n'est pas un mois du calendrier et reste hors du curseur.

export interface TimelinePeriod {
  period: string;
  rolling: boolean;
}

export function monthTimeline<T extends TimelinePeriod>(periods: readonly T[]): T[] {
  return periods.filter((entry) => !entry.rolling).sort((a, b) => a.period.localeCompare(b.period));
}

/** Mois choisi pour le côté « avant » d'une comparaison : le mois précédent, sinon aucun. */
export function defaultBeforePeriod(timeline: readonly TimelinePeriod[], current: string | null) {
  const index = timeline.findIndex((entry) => entry.period === current);
  return index > 0 ? (timeline[index - 1]?.period ?? null) : null;
}
