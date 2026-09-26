// Forêt aléatoire de classification (arbres CART, indice de Gini), sans dépendance : entraînement
// et prédiction reproductibles (tirage pseudo-aléatoire à graine), modèle sérialisable en JSON.
// Utilisée pour reconnaître la culture d'une parcelle à partir de ses séries satellite (ADR-0030).

/** Nœud d'arbre sérialisé : [variable, seuil, gauche, droite] ou feuille [-1, probabilités]. */
export type TreeNode = [number, number, number, number] | [-1, number[]];

export interface RandomForestParams {
  trees: number;
  maxDepth: number;
  minLeaf: number;
  /** Variables tirées à chaque nœud ; par défaut la racine carrée du nombre de variables. */
  featuresPerSplit?: number;
  /** Poids des classes inverses de leur fréquence, pour ne pas écraser les cultures rares. */
  balanced: boolean;
  seed: number;
}

export interface RandomForestModel {
  classes: string[];
  features: string[];
  params: RandomForestParams;
  trees: TreeNode[][];
}

export const DEFAULT_FOREST: RandomForestParams = {
  trees: 100,
  maxDepth: 14,
  minLeaf: 2,
  balanced: true,
  seed: 20260927,
};

/** Générateur mulberry32 : rapide, reproductible, suffisant pour tirer des échantillons. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gini(counts: Float64Array, total: number): number {
  if (total <= 0) return 0;
  let sum = 0;
  for (const count of counts) sum += (count / total) ** 2;
  return 1 - sum;
}

interface Split {
  feature: number;
  threshold: number;
  score: number;
}

function bestSplit(
  X: readonly number[][],
  y: readonly number[],
  weights: readonly number[],
  rows: number[],
  features: number[],
  classCount: number,
  minLeaf: number,
): Split | null {
  let best: Split | null = null;
  const parent = new Float64Array(classCount);
  let parentTotal = 0;
  for (const row of rows) {
    const label = y[row]!;
    parent[label] = (parent[label] ?? 0) + weights[row]!;
    parentTotal += weights[row]!;
  }
  const parentGini = gini(parent, parentTotal);
  for (const feature of features) {
    const sorted = [...rows].sort((a, b) => X[a]![feature]! - X[b]![feature]!);
    const left = new Float64Array(classCount);
    const right = Float64Array.from(parent);
    let leftTotal = 0;
    let rightTotal = parentTotal;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const row = sorted[index]!;
      const weight = weights[row]!;
      const label = y[row]!;
      left[label] = (left[label] ?? 0) + weight;
      right[label] = (right[label] ?? 0) - weight;
      leftTotal += weight;
      rightTotal -= weight;
      const value = X[row]![feature]!;
      const next = X[sorted[index + 1]!]![feature]!;
      if (value === next || index + 1 < minLeaf || sorted.length - index - 1 < minLeaf) continue;
      const score =
        parentGini -
        (leftTotal / parentTotal) * gini(left, leftTotal) -
        (rightTotal / parentTotal) * gini(right, rightTotal);
      if (!best || score > best.score) {
        best = { feature, threshold: (value + next) / 2, score };
      }
    }
  }
  return best && best.score > 1e-9 ? best : null;
}

function leaf(
  y: readonly number[],
  weights: readonly number[],
  rows: number[],
  classCount: number,
) {
  const counts = new Array<number>(classCount).fill(0);
  let total = 0;
  for (const row of rows) {
    counts[y[row]!]! += weights[row]!;
    total += weights[row]!;
  }
  return counts.map((count) => (total > 0 ? Number((count / total).toFixed(4)) : 0));
}

function growTree(
  X: readonly number[][],
  y: readonly number[],
  weights: readonly number[],
  rows: number[],
  classCount: number,
  params: RandomForestParams,
  random: () => number,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  const featureCount = X[0]?.length ?? 0;
  const perSplit = params.featuresPerSplit ?? Math.max(1, Math.round(Math.sqrt(featureCount)));
  const build = (subset: number[], depth: number): number => {
    const index = nodes.length;
    const pure = subset.every((row) => y[row] === y[subset[0]!]);
    if (depth >= params.maxDepth || subset.length < 2 * params.minLeaf || pure) {
      nodes.push([-1, leaf(y, weights, subset, classCount)]);
      return index;
    }
    const candidates: number[] = [];
    const pool = Array.from({ length: featureCount }, (_, feature) => feature);
    while (candidates.length < perSplit && pool.length > 0) {
      const pick = Math.floor(random() * pool.length);
      candidates.push(pool.splice(pick, 1)[0]!);
    }
    const split = bestSplit(X, y, weights, subset, candidates, classCount, params.minLeaf);
    if (!split) {
      nodes.push([-1, leaf(y, weights, subset, classCount)]);
      return index;
    }
    nodes.push([split.feature, split.threshold, -1, -1]);
    const leftRows = subset.filter((row) => X[row]![split.feature]! <= split.threshold);
    const rightRows = subset.filter((row) => X[row]![split.feature]! > split.threshold);
    const left = build(leftRows, depth + 1);
    const right = build(rightRows, depth + 1);
    nodes[index] = [split.feature, split.threshold, left, right];
    return index;
  };
  build(rows, 0);
  return nodes;
}

export interface TrainingResult {
  model: RandomForestModel;
  /** Précision hors sac : chaque parcelle jugée par les seuls arbres qui ne l'ont pas vue. */
  outOfBagAccuracy: number | null;
}

/**
 * `sampleWeights` : poids de chaque exemple, multiplié par celui de sa classe ; une parcelle
 * visitée sur le terrain peut ainsi compter plus qu'une parcelle vérifiée au bureau.
 */
export function trainRandomForest(
  X: readonly number[][],
  labels: readonly string[],
  featureNames: readonly string[],
  params: RandomForestParams = DEFAULT_FOREST,
  sampleWeights?: readonly number[],
): TrainingResult {
  if (X.length !== labels.length || X.length === 0) {
    throw new RangeError("Données d'entraînement vides ou incohérentes");
  }
  if (sampleWeights && sampleWeights.length !== X.length) {
    throw new RangeError("Un poids par exemple est attendu");
  }
  const classes = [...new Set(labels)].sort();
  const y = labels.map((label) => classes.indexOf(label));
  const frequency = classes.map((_, index) => y.filter((value) => value === index).length);
  const weights = y.map(
    (value, row) =>
      (params.balanced ? X.length / (classes.length * frequency[value]!) : 1) *
      (sampleWeights?.[row] ?? 1),
  );
  const random = seededRandom(params.seed);
  const trees: TreeNode[][] = [];
  const oobVotes = X.map(() => new Array<number>(classes.length).fill(0));
  for (let tree = 0; tree < params.trees; tree += 1) {
    const inBag = new Uint8Array(X.length);
    const rows: number[] = [];
    for (let draw = 0; draw < X.length; draw += 1) {
      const row = Math.floor(random() * X.length);
      rows.push(row);
      inBag[row] = 1;
    }
    const nodes = growTree(X, y, weights, rows, classes.length, params, random);
    trees.push(nodes);
    for (let row = 0; row < X.length; row += 1) {
      if (inBag[row]) continue;
      const proba = predictTree(nodes, X[row]!);
      for (let index = 0; index < classes.length; index += 1) {
        oobVotes[row]![index]! += proba[index] ?? 0;
      }
    }
  }
  let judged = 0;
  let correct = 0;
  oobVotes.forEach((votes, row) => {
    const total = votes.reduce((sum, value) => sum + value, 0);
    if (total === 0) return;
    judged += 1;
    if (argmax(votes) === y[row]) correct += 1;
  });
  return {
    model: { classes, features: [...featureNames], params, trees },
    outOfBagAccuracy: judged > 0 ? correct / judged : null,
  };
}

function predictTree(nodes: readonly TreeNode[], x: readonly number[]): number[] {
  let node = nodes[0]!;
  while (node[0] !== -1) {
    const [feature, threshold, left, right] = node as [number, number, number, number];
    node = nodes[(x[feature] ?? 0) <= threshold ? left : right]!;
  }
  return (node as [-1, number[]])[1];
}

function argmax(values: readonly number[]): number {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] ?? 0) > (values[best] ?? 0)) best = index;
  }
  return best;
}

/** Probabilité de chaque classe : moyenne des feuilles atteintes dans tous les arbres. */
export function predictProbabilities(model: RandomForestModel, x: readonly number[]): number[] {
  const sums = new Array<number>(model.classes.length).fill(0);
  for (const nodes of model.trees) {
    const proba = predictTree(nodes, x);
    for (let index = 0; index < sums.length; index += 1) sums[index]! += proba[index] ?? 0;
  }
  return sums.map((sum) => sum / model.trees.length);
}

export function predictClass(
  model: RandomForestModel,
  x: readonly number[],
): { label: string; confidence: number; probabilities: Record<string, number> } {
  const proba = predictProbabilities(model, x);
  const best = argmax(proba);
  return {
    label: model.classes[best]!,
    confidence: proba[best] ?? 0,
    probabilities: Object.fromEntries(
      model.classes.map((label, index) => [label, Number((proba[index] ?? 0).toFixed(3))]),
    ),
  };
}
