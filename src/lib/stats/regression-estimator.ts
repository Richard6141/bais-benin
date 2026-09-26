// Estimation d'une proportion de territoire à partir d'un échantillon de points (ADR-0033) :
// estimateur par régression sur une variable auxiliaire connue partout (la carte des pixels), avec
// repli sur l'estimateur direct. Formules de Cochran (Sampling Techniques, chapitre 7), population
// de points infinie (pas de correction de population finie).

/** Quantile de la loi normale pour une marge à 95 %. */
export const Z_95 = 1.96;

export interface ProportionEstimate {
  n: number;
  /** Part estimée, bornée à [0, 1]. */
  proportion: number;
  /** Variance de la part estimée. */
  variance: number;
  method: "regression" | "direct";
  /** Variance de l'estimateur direct (moyenne des points), pour mesurer le gain de la carte. */
  directVariance: number;
  /** Corrélation entre terrain et carte dans l'échantillon ; null sans carte ou sans variation. */
  correlation: number | null;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * `y` : 1 si le terrain voit la culture au point ; `x` : 1 si la carte y voit sa classe ;
 * `populationMeanX` : part de la classe sur toute la zone selon la carte. Sans `x` ou sans
 * moyenne connue, ou si la carte ne varie pas dans l'échantillon, estimateur direct. Null sous
 * trois points : pas de variance possible.
 */
export function estimateProportion(
  y: readonly number[],
  x: readonly number[] | null,
  populationMeanX: number | null,
): ProportionEstimate | null {
  if (x && x.length !== y.length)
    throw new RangeError("Une valeur de carte par point est attendue");
  const n = y.length;
  if (n < 3) return null;
  const yBar = mean(y);
  const syy = y.reduce((sum, value) => sum + (value - yBar) ** 2, 0);
  const directVariance = syy / (n - 1) / n;
  const direct: ProportionEstimate = {
    n,
    proportion: Math.min(1, Math.max(0, yBar)),
    variance: directVariance,
    method: "direct",
    directVariance,
    correlation: null,
  };
  if (!x || populationMeanX === null) return direct;
  const xBar = mean(x);
  let sxx = 0;
  let sxy = 0;
  for (let index = 0; index < n; index += 1) {
    sxx += (x[index]! - xBar) ** 2;
    sxy += (x[index]! - xBar) * (y[index]! - yBar);
  }
  if (sxx === 0) return direct;
  const slope = sxy / sxx;
  let residuals = 0;
  for (let index = 0; index < n; index += 1) {
    residuals += (y[index]! - yBar - slope * (x[index]! - xBar)) ** 2;
  }
  return {
    n,
    proportion: Math.min(1, Math.max(0, yBar + slope * (populationMeanX - xBar))),
    variance: residuals / (n - 2) / n,
    method: "regression",
    directVariance,
    correlation: syy > 0 ? sxy / Math.sqrt(sxx * syy) : null,
  };
}

export interface AreaEstimate {
  areaHa: number;
  standardErrorHa: number;
  /** Demi-largeur de l'intervalle à 95 %. */
  marginHa: number;
  /** Coefficient de variation : écart type rapporté à la surface ; null pour une surface nulle. */
  cv: number | null;
}

/** Strates indépendantes (communes) : les surfaces et leurs variances s'additionnent. */
export function combineStrata(
  strata: readonly { areaHa: number; varianceHa2: number }[],
): AreaEstimate {
  const areaHa = strata.reduce((sum, stratum) => sum + stratum.areaHa, 0);
  const standardErrorHa = Math.sqrt(strata.reduce((sum, stratum) => sum + stratum.varianceHa2, 0));
  return {
    areaHa,
    standardErrorHa,
    marginHa: Z_95 * standardErrorHa,
    cv: areaHa > 0 ? standardErrorHa / areaHa : null,
  };
}
