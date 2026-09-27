// Mois de la vue du ciel rangés du plus ancien au plus récent, pour le curseur temporel : la
// fenêtre glissante (60 jours) n'est pas un mois du calendrier et reste hors du curseur.

export interface TimelinePeriod {
  period: string;
  rolling: boolean;
}

export function monthTimeline<T extends TimelinePeriod>(periods: readonly T[]): T[] {
  return periods.filter((entry) => !entry.rolling).sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Mois choisi pour le côté « avant » d'une comparaison. La fenêtre glissante (60 jours) n'a pas
 * de position dans le curseur : son « avant » est le mois complet le plus récent du catalogue.
 * Pour un mois du calendrier, c'est le mois précédent ; sans mois plus ancien, aucun.
 */
export function defaultBeforePeriod(
  timeline: readonly TimelinePeriod[],
  current: string | null,
  currentIsRolling = false,
) {
  if (currentIsRolling) return timeline[timeline.length - 1]?.period ?? null;
  const index = timeline.findIndex((entry) => entry.period === current);
  return index > 0 ? (timeline[index - 1]?.period ?? null) : null;
}
