/**
 * Générateur pseudo-aléatoire déterministe (mulberry32) et tirages dérivés.
 *
 * Copie locale volontaire : les fixtures météo ne dépendent pas des générateurs du jeu de données
 * synthétique, écrits en parallèle, pour rester utilisables seules dans les tests du moteur de
 * règles. mulberry32 est un générateur 32 bits rapide, suffisant pour des séries de démonstration
 * (il n'a aucune prétention cryptographique).
 */

export interface RandomSource {
  /** Nombre uniforme dans [0, 1). */
  next(): number;
  /** Nombre uniforme dans [min, max). */
  uniform(min: number, max: number): number;
  /** Tirage gaussien centré réduit (Box-Muller). */
  normal(): number;
  /** Tirage log-normal dont l'espérance vaut `mean`, avec l'écart-type logarithmique `sigma`. */
  logNormal(mean: number, sigma: number): number;
  /** Vrai avec la probabilité `probability`. */
  chance(probability: number): boolean;
}

export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (): number => {
    // On écarte le zéro strict pour éviter log(0).
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    normal,
    // Pour une log-normale, E[X] = exp(mu + sigma^2 / 2) ; on fixe mu pour retrouver `mean`.
    logNormal: (mean, sigma) => Math.exp(Math.log(mean) - (sigma * sigma) / 2 + sigma * normal()),
    chance: (probability) => next() < probability,
  };
}

/** Hachage FNV-1a 32 bits d'une chaîne, pour dériver une graine par lieu. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Combine une graine numérique et un identifiant de lieu en une graine unique et stable. */
export function combineSeed(seed: number, locationKey: string): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ hashString(locationKey)) >>> 0;
}
