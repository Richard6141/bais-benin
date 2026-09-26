import { describe, expect, it } from "vitest";
import {
  predictClass,
  predictProbabilities,
  seededRandom,
  trainRandomForest,
  type RandomForestParams,
} from "./random-forest";

// Forêt aléatoire : apprend des classes séparables, reste reproductible et rend une confiance.

const PARAMS: RandomForestParams = { trees: 30, maxDepth: 8, minLeaf: 1, balanced: true, seed: 7 };

function dataset(count: number, seed: number) {
  const random = seededRandom(seed);
  const X: number[][] = [];
  const labels: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = ["MAIZE", "COTTON", "RICE"][index % 3]!;
    const peak = label === "MAIZE" ? 0.7 : label === "COTTON" ? 0.75 : 0.65;
    const peakMonth = label === "MAIZE" ? 7 : label === "COTTON" ? 9 : 8;
    const flood = label === "RICE" ? 1 : 0;
    X.push([
      peak + (random() - 0.5) * 0.1,
      peakMonth + (random() - 0.5) * 1.2,
      flood + (random() - 0.5) * 0.4,
      random(),
    ]);
    labels.push(label);
  }
  return { X, labels };
}

const FEATURES = ["ndvi_max", "ndvi_argmax", "flood", "noise"];

describe("forêt aléatoire", () => {
  it("reconnaît des classes séparables sur des données qu'elle n'a pas vues", () => {
    const train = dataset(300, 1);
    const test = dataset(150, 2);
    const { model, outOfBagAccuracy } = trainRandomForest(train.X, train.labels, FEATURES, PARAMS);
    const correct = test.X.filter(
      (x, index) => predictClass(model, x).label === test.labels[index],
    ).length;
    expect(correct / test.X.length).toBeGreaterThan(0.9);
    expect(outOfBagAccuracy).toBeGreaterThan(0.85);
  });

  it("donne des probabilités qui somment à 1 et une confiance de classe gagnante", () => {
    const train = dataset(90, 3);
    const { model } = trainRandomForest(train.X, train.labels, FEATURES, PARAMS);
    const proba = predictProbabilities(model, train.X[0]!);
    expect(proba.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
    const result = predictClass(model, train.X[0]!);
    expect(result.confidence).toBe(Math.max(...proba));
    expect(Object.keys(result.probabilities)).toEqual(["COTTON", "MAIZE", "RICE"]);
  });

  it("donne le même modèle à graine égale, et survit à un aller-retour JSON", () => {
    const train = dataset(60, 4);
    const first = trainRandomForest(train.X, train.labels, FEATURES, PARAMS).model;
    const second = trainRandomForest(train.X, train.labels, FEATURES, PARAMS).model;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const restored = JSON.parse(JSON.stringify(first)) as typeof first;
    expect(predictClass(restored, train.X[5]!)).toEqual(predictClass(first, train.X[5]!));
  });

  it("donne plus de poids aux exemples les plus sûrs", () => {
    // Deux étiquettes contradictoires pour le même point : le poids tranche.
    const X = [[0.5], [0.5], [0.5], [0.9], [0.1]];
    const labels = ["A", "B", "B", "A", "B"];
    const params = { ...PARAMS, balanced: false, trees: 50 };
    const light = trainRandomForest(X, labels, ["x"], params).model;
    const heavy = trainRandomForest(X, labels, ["x"], params, [10, 1, 1, 1, 1]).model;
    expect(predictProbabilities(heavy, [0.5])[0]!).toBeGreaterThan(
      predictProbabilities(light, [0.5])[0]!,
    );
  });

  it("refuse des données incohérentes", () => {
    expect(() => trainRandomForest([[1]], ["A", "B"], ["x"], PARAMS)).toThrow(RangeError);
    expect(() => trainRandomForest([[1], [2]], ["A", "B"], ["x"], PARAMS, [1])).toThrow(RangeError);
  });
});
