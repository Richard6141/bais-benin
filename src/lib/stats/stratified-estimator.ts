// Tirage stratifié à deux phases (ADR-0037) : allocation de Neyman avec plancher, tirage
// systématique dans une strate, puis estimation d'une proportion à partir des points constatés de
// chaque strate, avec des poids de strate connus (la carte) ou estimés par la première phase.
// Formules de Cochran (Sampling Techniques, 1977, chapitres 5 et 12) et Rao (1973), population
// de points infinie (pas de correction de population finie).

export interface StratumDesign {
  /** Points de première phase de la strate : le plus de points qu'on puisse y visiter. */
  candidates: number;
  /** Poids de la strate (part de la commune). */
  weight: number;
  /** Écart type attendu de la variable d'intérêt dans la strate. */
  sd: number;
}

/**
 * Répartit `total` points entre les strates : `n_h ∝ W_h S_h` (Neyman), au moins `floor` points
 * par strate (ou tous ses points de première phase s'il y en a moins), jamais plus que ses points
 * de première phase. Arrondi aux plus grands restes : la somme vaut `total`, ou tous les points
 * de première phase s'il y en a moins.
 */
export function neymanAllocation(
  strata: readonly StratumDesign[],
  total: number,
  floor: number,
): number[] {
  const available = strata.reduce((sum, stratum) => sum + stratum.candidates, 0);
  const target = Math.min(Math.max(0, Math.round(total)), available);
  const lower = strata.map((stratum) => Math.min(floor, stratum.candidates));
  const upper = strata.map((stratum) => stratum.candidates);
  const lowerSum = lower.reduce((sum, value) => sum + value, 0);
  if (lowerSum >= target) {
    // Le plancher prend déjà tout : partage au prorata des planchers.
    return roundToTotal(
      lower.map((value) => (lowerSum > 0 ? (value * target) / lowerSum : 0)),
      target,
      upper,
    );
  }

  // Neyman sur les strates libres ; une strate sous son plancher ou au-dessus de ses points de
  // première phase est fixée à cette borne, puis on recommence sur les autres.
  const fixed: (number | null)[] = strata.map(() => null);
  const shares = strata.map((stratum) => Math.max(0, stratum.weight * stratum.sd));
  for (;;) {
    const free = strata.map((_, index) => index).filter((index) => fixed[index] === null);
    const left = target - fixed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const freeShare = free.reduce((sum, index) => sum + shares[index]!, 0);
    const freeCandidates = free.reduce((sum, index) => sum + upper[index]!, 0);
    const proposal = new Map(
      free.map((index) => [
        index,
        freeShare > 0
          ? (left * shares[index]!) / freeShare
          : freeCandidates > 0
            ? (left * upper[index]!) / freeCandidates
            : 0,
      ]),
    );
    let changed = false;
    for (const [index, value] of proposal) {
      if (value < lower[index]!) {
        fixed[index] = lower[index]!;
        changed = true;
      } else if (value > upper[index]!) {
        fixed[index] = upper[index]!;
        changed = true;
      }
    }
    if (!changed) {
      return roundToTotal(
        strata.map((_, index) => fixed[index] ?? proposal.get(index) ?? 0),
        target,
        upper,
      );
    }
  }
}

/** Arrondi aux plus grands restes, sans dépasser la borne haute de chaque strate. */
function roundToTotal(
  values: readonly number[],
  total: number,
  upper: readonly number[],
): number[] {
  const rounded = values.map((value, index) => Math.min(upper[index]!, Math.floor(value)));
  let left = total - rounded.reduce((sum, value) => sum + value, 0);
  const order = values
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  while (left > 0) {
    let placed = false;
    for (const { index } of order) {
      if (left === 0) break;
      if (rounded[index]! < upper[index]!) {
        rounded[index]! += 1;
        left -= 1;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return rounded;
}

/**
 * Rangs de `take` points parmi `size`, tirés systématiquement : pas `size / take`, départ tiré
 * au hasard dans le premier pas. Les points restent étalés le long de la liste (la grille).
 */
export function systematicPositions(size: number, take: number, random: () => number): number[] {
  if (take <= 0 || size <= 0) return [];
  if (take >= size) return Array.from({ length: size }, (_, index) => index);
  const step = size / take;
  const start = random() * step;
  return Array.from({ length: take }, (_, index) =>
    Math.min(size - 1, Math.floor(start + index * step)),
  );
}

/**
 * Poids connus par la carte, gardés s'ils s'accordent avec la première phase : chaque poids à
 * moins de trois écarts types de la part mesurée sur les `n′` points. Sinon null : les poids de
 * la première phase serviront (estimateur à deux phases).
 */
export function compatibleWeights(
  known: readonly number[],
  firstPhase: readonly number[],
): number[] | null {
  const total = firstPhase.reduce((sum, value) => sum + value, 0);
  if (known.length !== firstPhase.length || total < 2) return null;
  const agree = known.every((weight, index) => {
    const share = firstPhase[index]! / total;
    return Math.abs(weight - share) <= 3 * Math.sqrt((share * (1 - share)) / total);
  });
  return agree ? [...known] : null;
}

export interface StratumSample {
  /** Points de première phase de la strate (`n′_h`). */
  firstPhase: number;
  /** Valeur de chaque point constaté de la strate (1 si la cible est vue, sinon 0). */
  values: readonly number[];
}

export interface StratifiedEstimate {
  /** Points constatés, toutes strates réunies. */
  n: number;
  /** Part estimée, bornée à [0, 1]. */
  proportion: number;
  variance: number;
  /** Vrai si les poids des strates viennent de la carte, faux s'ils viennent de la 1re phase. */
  weightsKnown: boolean;
  /** Variance d'un tirage simple de même taille, pour mesurer le gain du plan stratifié. */
  simpleVariance: number;
  strata: { weight: number; n: number; mean: number }[];
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Part d'une cible dans une commune tirée en deux phases. Poids connus (`knownWeights`) :
 * `V = Σ W_h² s²_h / n_h`. Sinon poids de première phase `w_h = n′_h / n′` et variance du double
 * échantillonnage pour la stratification (Cochran 12.3, Rao 1973). Null si une strate présente en
 * première phase a moins de deux points constatés, ou sous deux points de première phase.
 */
export function estimateStratifiedProportion(
  strata: readonly StratumSample[],
  knownWeights: readonly number[] | null,
): StratifiedEstimate | null {
  const firstPhase = strata.reduce((sum, stratum) => sum + stratum.firstPhase, 0);
  if (firstPhase < 2) return null;
  if (knownWeights && knownWeights.length !== strata.length) {
    throw new RangeError("Un poids par strate est attendu");
  }
  const present = strata
    .map((stratum, index) => ({
      ...stratum,
      share: stratum.firstPhase / firstPhase,
      weight: knownWeights ? knownWeights[index]! : stratum.firstPhase / firstPhase,
    }))
    .filter((stratum) => stratum.firstPhase > 0 || stratum.weight > 0);
  if (present.some((stratum) => stratum.values.length < 2)) return null;

  const detail = present.map((stratum) => {
    const average = mean(stratum.values);
    const s2 =
      stratum.values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (stratum.values.length - 1);
    return { ...stratum, average, s2, n: stratum.values.length };
  });
  const estimate = detail.reduce((sum, stratum) => sum + stratum.weight * stratum.average, 0);
  const variance = knownWeights
    ? detail.reduce((sum, stratum) => sum + (stratum.weight ** 2 * stratum.s2) / stratum.n, 0)
    : detail.reduce(
        (sum, stratum) =>
          sum +
          (((stratum.firstPhase - 1) / (firstPhase - 1)) * stratum.share * stratum.s2) / stratum.n,
        0,
      ) +
      detail.reduce((sum, stratum) => sum + stratum.share * (stratum.average - estimate) ** 2, 0) /
        (firstPhase - 1);
  const n = detail.reduce((sum, stratum) => sum + stratum.n, 0);
  const proportion = Math.min(1, Math.max(0, estimate));
  return {
    n,
    proportion,
    variance,
    weightsKnown: knownWeights !== null,
    simpleVariance: (proportion * (1 - proportion)) / n,
    strata: detail.map((stratum) => ({
      weight: stratum.weight,
      n: stratum.n,
      mean: stratum.average,
    })),
  };
}
