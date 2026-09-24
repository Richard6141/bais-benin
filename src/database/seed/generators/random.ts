/**
 * Générateur pseudo-aléatoire déterministe pour le jeu de données de démonstration (docs/08 §6.2).
 *
 * `Math.random` n'est pas reproductible d'une exécution à l'autre ; ici, une même graine donne
 * exactement la même suite, ce qui permet de rejouer un test de charge ou de retrouver une anomalie
 * par son identifiant. L'algorithme retenu est mulberry32 : 32 bits d'état, une dizaine
 * d'opérations par tirage, qualité statistique suffisante pour des distributions de démonstration.
 */

export interface WeightedItem<T> {
  value: T;
  weight: number;
}

export interface Random {
  /** Nombre dans [0, 1). */
  next(): number;
  /** Entier dans [min, max], bornes incluses. */
  int(min: number, max: number): number;
  /** Booléen vrai avec la probabilité donnée. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weightedPick<T>(items: readonly WeightedItem<T>[]): T;
  /** Loi normale centrée réduite (Box-Muller). */
  gaussian(): number;
  /** Loi log-normale paramétrée par sa médiane et l'écart-type du logarithme. */
  logNormal(median: number, sigma: number): number;
  /** Copie mélangée (Fisher-Yates), l'original n'est pas modifié. */
  shuffle<T>(items: readonly T[]): T[];
  /** Dérive un générateur indépendant, pour isoler une sous-partie de la génération. */
  fork(label: string): Random;
}

/** Hachage d'une chaîne vers 32 bits (FNV-1a), pour dériver des graines à partir de libellés. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    if (max < min) {
      throw new RangeError(`Intervalle invalide : [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  }

  function chance(probability: number): boolean {
    return next() < probability;
  }

  function pick<T>(items: readonly T[]): T {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) {
      throw new RangeError("Tirage dans une liste vide");
    }
    return item;
  }

  function weightedPick<T>(items: readonly WeightedItem<T>[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) {
      throw new RangeError("Tirage pondéré sans poids positif");
    }
    let cursor = next() * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor < 0) {
        return item.value;
      }
    }
    // Erreurs d'arrondi : le dernier élément absorbe le reliquat.
    const last = items[items.length - 1];
    if (last === undefined) {
      throw new RangeError("Tirage pondéré dans une liste vide");
    }
    return last.value;
  }

  function gaussian(): number {
    // On écarte 0 pour éviter log(0).
    let u = 0;
    while (u === 0) {
      u = next();
    }
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function logNormal(median: number, sigma: number): number {
    return Math.exp(Math.log(median) + sigma * gaussian());
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = int(0, index);
      const a = copy[index];
      const b = copy[swap];
      if (a !== undefined && b !== undefined) {
        copy[index] = b;
        copy[swap] = a;
      }
    }
    return copy;
  }

  function fork(label: string): Random {
    return createRandom((hashSeed(label) ^ Math.floor(next() * 4294967296)) >>> 0);
  }

  return { next, int, chance, pick, weightedPick, gaussian, logNormal, shuffle, fork };
}
