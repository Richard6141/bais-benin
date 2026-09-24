// Priorité de vérification calculée côté client ou serveur à partir de la ligne de liste
// (docs/modules/registre-parcours-ux.md §2.D) : ces motifs sont affichés en un mot et servent
// à trier la file. Aucun n'est bloquant.

export interface PriorityInput {
  declaredAreaHa: number;
  computedAreaHa: number | null;
  parcelCount: number;
  createdAt: Date | string;
}

export type PriorityReason = "AREA_GAP" | "LARGE_AREA" | "NO_PARCEL" | "OLD";

export const PRIORITY_LABELS: Record<PriorityReason, string> = {
  AREA_GAP: "Écart de surface",
  LARGE_AREA: "Grande surface",
  NO_PARCEL: "Sans parcelle",
  OLD: "Ancienne",
};

export const AREA_GAP_THRESHOLD_PERCENT = 20;
export const LARGE_AREA_HA = 10;
export const OLD_AFTER_DAYS = 60;

export function priorityReasons(farm: PriorityInput, now: Date = new Date()): PriorityReason[] {
  const reasons: PriorityReason[] = [];
  if (farm.computedAreaHa !== null && farm.declaredAreaHa > 0) {
    const gap = Math.abs(farm.computedAreaHa - farm.declaredAreaHa) / farm.declaredAreaHa;
    if (gap * 100 > AREA_GAP_THRESHOLD_PERCENT) reasons.push("AREA_GAP");
  }
  if (farm.declaredAreaHa > LARGE_AREA_HA) reasons.push("LARGE_AREA");
  if (farm.parcelCount === 0) reasons.push("NO_PARCEL");
  const ageDays = (now.getTime() - new Date(farm.createdAt).getTime()) / 86_400_000;
  if (ageDays > OLD_AFTER_DAYS) reasons.push("OLD");
  return reasons;
}

// Score de tri : plus il y a de motifs, plus l'exploitation remonte ; à motifs égaux, la plus ancienne.
export function priorityScore(farm: PriorityInput, now: Date = new Date()): number {
  return priorityReasons(farm, now).length;
}
