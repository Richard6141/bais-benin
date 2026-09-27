// Bornes du rideau avant/après (sky-curtain.tsx) : la poignée reste dans la partie visible de la
// carte, à droite du panneau des réglages à partir de 1024px (même seuil et même décalage que ses
// étiquettes). En dessous, ce panneau est un bouton replié : seule une petite marge est gardée.

export const CURTAIN_PANEL_CLEARANCE_PX = 268;
export const CURTAIN_EDGE_MARGIN_PX = 12;
export const CURTAIN_WIDE_BREAKPOINT_PX = 1024;
/** Pas d'un appui flèche gauche/droite, en pixels d'écran plutôt qu'en pourcentage : un
 * déplacement de taille constante quel que soit le zoom de la fenêtre. */
export const CURTAIN_KEY_STEP_PX = 24;

/** Ramène une position en pixels dans la zone permise, pour une largeur de conteneur donnée. */
export function clampCurtainPx(px: number, containerWidthPx: number, wide: boolean): number {
  const min = wide ? CURTAIN_PANEL_CLEARANCE_PX : CURTAIN_EDGE_MARGIN_PX;
  const max = containerWidthPx - CURTAIN_EDGE_MARGIN_PX;
  if (max <= min) return containerWidthPx / 2;
  return Math.min(Math.max(px, min), max);
}

export function curtainPxToPercent(px: number, containerWidthPx: number): number {
  if (containerWidthPx <= 0) return 50;
  return (px / containerWidthPx) * 100;
}

export function curtainPercentToPx(percent: number, containerWidthPx: number): number {
  return (percent / 100) * containerWidthPx;
}
