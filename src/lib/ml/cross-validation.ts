// Validation croisée par groupes (ADR-0032) : chaque groupe d'exemples, une commune par exemple,
// est jugé par un modèle entraîné sans lui. La précision hors sac juge une parcelle avec des arbres
// qui ont vu ses voisines de la même commune, aux mêmes nuages et aux mêmes sols : elle flatte le
// modèle. Juger chaque commune sur un modèle qui ne l'a jamais vue dit ce qu'il vaut ailleurs.

import { predictClass, trainRandomForest, type RandomForestParams } from "./random-forest";

/**
 * Répartit les groupes en `k` plis de tailles proches, de façon reproductible : les plus gros
 * groupes d'abord, chacun dans le pli le moins rempli. Avec `k` groupes ou moins, un pli par
 * groupe (chaque commune est laissée de côté à son tour).
 */
export function groupFolds(groups: readonly string[], k: number): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const group of groups) sizes.set(group, (sizes.get(group) ?? 0) + 1);
  const folds = Math.max(1, Math.min(k, sizes.size));
  const load = new Array<number>(folds).fill(0);
  const assignment = new Map<string, number>();
  const ordered = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [group, size] of ordered) {
    let target = 0;
    for (let fold = 1; fold < folds; fold += 1) {
      if ((load[fold] ?? 0) < (load[target] ?? 0)) target = fold;
    }
    assignment.set(group, target);
    load[target] = (load[target] ?? 0) + size;
  }
  return assignment;
}

export interface GroupCrossValidation {
  folds: number;
  /**
   * Pour chaque exemple, la classe et la confiance que lui donne le modèle de son pli ; null quand
   * ce pli n'a pas pu être appris (moins de deux classes sans lui).
   */
  predictions: ({ label: string; confidence: number } | null)[];
}

/** Null avec un seul groupe : il n'y a rien à laisser de côté. */
export function crossValidateByGroup(
  X: readonly number[][],
  labels: readonly string[],
  groups: readonly string[],
  featureNames: readonly string[],
  params: RandomForestParams,
  options: { sampleWeights?: readonly number[]; k?: number } = {},
): GroupCrossValidation | null {
  if (X.length !== labels.length || X.length !== groups.length) {
    throw new RangeError("Un groupe et une étiquette par exemple sont attendus");
  }
  const assignment = groupFolds(groups, options.k ?? 5);
  const folds = new Set(assignment.values()).size;
  if (folds < 2) return null;
  const predictions: GroupCrossValidation["predictions"] = new Array(X.length).fill(null);
  for (let fold = 0; fold < folds; fold += 1) {
    const train: number[] = [];
    const test: number[] = [];
    groups.forEach((group, row) => (assignment.get(group) === fold ? test : train).push(row));
    if (new Set(train.map((row) => labels[row])).size < 2) continue;
    const { model } = trainRandomForest(
      train.map((row) => X[row]!),
      train.map((row) => labels[row]!),
      featureNames,
      params,
      options.sampleWeights ? train.map((row) => options.sampleWeights![row]!) : undefined,
    );
    for (const row of test) {
      const { label, confidence } = predictClass(model, X[row]!);
      predictions[row] = { label, confidence };
    }
  }
  return { folds, predictions };
}
