// Strates du tirage à deux phases (ADR-0037) : la classe de la carte au point de première phase
// range ce point dans les « cultures annuelles » (cultures annuelles et riz, les classes des
// céréales, racines et tubercules) ou dans les autres terres.

export const FRAME_STRATA = ["ANNUAL_CROPS", "OTHER_LAND"] as const;
export type FrameStratum = (typeof FRAME_STRATA)[number];

/** Classes de la carte de la strate des cultures annuelles. */
export const ANNUAL_STRATUM_CLASSES: readonly string[] = ["ANNUAL", "RICE"];

/** Première phase : quatre points de grille classés par la carte pour un point visité. */
export const FIRST_PHASE_FACTOR = 4;

/** Plancher de points visités par strate (ou tous ses points de première phase s'il y en a moins). */
export const MIN_POINTS_PER_STRATUM = 20;

/**
 * Part vivrière attendue dans chaque strate, pour l'allocation de Neyman de la première campagne.
 * La strate des cultures annuelles est ainsi échantillonnée environ 2,3 fois plus densément.
 */
export const ANTICIPATED_STAPLE_SHARE: Record<FrameStratum, number> = {
  ANNUAL_CROPS: 0.5,
  OTHER_LAND: 0.05,
};

export function stratumOf(mapClass: string): FrameStratum {
  return ANNUAL_STRATUM_CLASSES.includes(mapClass) ? "ANNUAL_CROPS" : "OTHER_LAND";
}
