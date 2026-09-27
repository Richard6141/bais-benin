// Surface brûlée d'une parcelle exposée à un feu (ADR-0038 §2), en fonctions pures : fenêtres de
// lecture autour de la détection, fourchette de surface tirée des classes de dNBR, et seuil à
// partir duquel une déclaration de sinistre est proposée.

const DAY_MS = 86_400_000;

/** Parcelle exposée : contour à moins de 500 m d'une détection (demi-pixel VIIRS et position). */
export const EXPOSURE_M = 500;
/** En dessous, moins de 6 pixels de 20 m : la mesure n'a pas de sens. */
export const MIN_PARCEL_HA = 0.25;
/** Dernière image nette cherchée dans les 20 jours avant la détection. */
export const PRE_DAYS = 20;
/** Première image nette cherchée dans les 15 jours après (à partir du lendemain). */
export const POST_DAYS = 15;
/** Mesure au plus tôt quand la fenêtre d'après est close, au plus tard 30 jours après le feu. */
export const MEASURE_AFTER_DAYS = POST_DAYS;
export const EXPIRE_DAYS = 30;
/** Sous 60 % de pixels nets avant et après, pas de surface. */
export const MIN_VALID_SHARE = 0.6;
/** Déclaration proposée à partir de 0,1 ha ou 10 % de la parcelle (bas de la fourchette). */
export const DECLARATION_MIN_HA = 0.1;
export const DECLARATION_MIN_SHARE = 0.1;

export function burnWindows(fireAt: Date): {
  preFrom: Date;
  postTo: Date;
  measureAfter: Date;
  expiresAt: Date;
} {
  const fire = fireAt.getTime();
  return {
    preFrom: new Date(fire - PRE_DAYS * DAY_MS),
    postTo: new Date(fire + POST_DAYS * DAY_MS),
    measureAfter: new Date(fire + MEASURE_AFTER_DAYS * DAY_MS),
    expiresAt: new Date(fire + EXPIRE_DAYS * DAY_MS),
  };
}

export interface BurnFigures {
  pixels: number;
  /** Part des pixels vus nets avant et après le feu. */
  validShare: number;
  /** Part brûlée (dNBR ≥ 0,27), brûlée possible comprise (≥ 0,10), et sévère (≥ 0,66). */
  lowShare: number;
  highShare: number;
  severeShare: number;
  lowHa: number;
  highHa: number;
  /** Assez de pixels nets pour donner une surface. */
  sufficient: boolean;
  /** Surface brûlée assez grande pour proposer une déclaration de sinistre. */
  proposesDeclaration: boolean;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * Fourchette de surface brûlée : le bas compte les pixels brûlés et sévères, le haut ajoute les
 * brûlés possibles, rapportés aux pixels nets puis à la surface de la parcelle.
 */
export function burnFigures(
  classPixels: readonly [number, number, number, number, number],
  parcelAreaHa: number,
): BurnFigures {
  const [unclear, unburned, possible, burned, severe] = classPixels;
  const pixels = unclear + unburned + possible + burned + severe;
  const valid = pixels - unclear;
  const validShare = pixels > 0 ? valid / pixels : 0;
  const share = (count: number) => (valid > 0 ? count / valid : 0);
  const lowShare = share(burned + severe);
  const highShare = share(possible + burned + severe);
  const sufficient = pixels > 0 && validShare >= MIN_VALID_SHARE;
  const lowHa = sufficient ? parcelAreaHa * lowShare : 0;
  return {
    pixels,
    validShare: round(validShare, 4),
    lowShare: round(lowShare, 4),
    highShare: round(highShare, 4),
    severeShare: round(share(severe), 4),
    lowHa: round(lowHa, 3),
    highHa: round(sufficient ? parcelAreaHa * highShare : 0, 3),
    sufficient,
    proposesDeclaration:
      sufficient && (lowHa >= DECLARATION_MIN_HA || lowShare >= DECLARATION_MIN_SHARE),
  };
}
