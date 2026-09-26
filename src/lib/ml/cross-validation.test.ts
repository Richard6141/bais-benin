import { describe, expect, it } from "vitest";
import { crossValidateByGroup, groupFolds } from "./cross-validation";
import { seededRandom, trainRandomForest, type RandomForestParams } from "./random-forest";

// Validation croisée par commune : plis reproductibles, et une précision qui ne se laisse pas
// flatter par ce que les parcelles d'une même commune ont en commun.

const PARAMS: RandomForestParams = { trees: 20, maxDepth: 8, minLeaf: 1, balanced: true, seed: 3 };
const FEATURES = ["ndvi_max", "ndvi_argmax", "commune_soil"];

describe("plis par groupe", () => {
  it("laisse chaque commune de côté à son tour quand il y en a peu", () => {
    const folds = groupFolds(["A", "A", "B", "C", "C", "C"], 5);
    expect(new Set(folds.values()).size).toBe(3);
    expect(folds.get("C")).toBe(0);
  });

  it("équilibre les plis quand il y a plus de communes que de plis", () => {
    const groups = ["A", "A", "A", "A", "B", "B", "B", "C", "C", "D", "D", "E"];
    const folds = groupFolds(groups, 2);
    const load = [0, 0];
    for (const group of groups) load[folds.get(group)!]! += 1;
    expect(Math.abs(load[0]! - load[1]!)).toBeLessThanOrEqual(1);
    expect(groupFolds(groups, 2)).toEqual(folds);
  });
});

describe("validation croisée par commune", () => {
  it("juge chaque commune par un modèle qui ne l'a jamais vue", () => {
    const random = seededRandom(11);
    const X: number[][] = [];
    const labels: string[] = [];
    const groups: string[] = [];
    for (let index = 0; index < 240; index += 1) {
      const label = index % 2 === 0 ? "MAIZE" : "COTTON";
      X.push([
        (label === "MAIZE" ? 0.7 : 0.8) + (random() - 0.5) * 0.05,
        (label === "MAIZE" ? 7 : 9) + (random() - 0.5),
        random(),
      ]);
      labels.push(label);
      groups.push(`C${index % 4}`);
    }
    const result = crossValidateByGroup(X, labels, groups, FEATURES, PARAMS);
    expect(result?.folds).toBe(4);
    const correct = result!.predictions.filter(
      (prediction, row) => prediction?.label === labels[row],
    ).length;
    expect(correct / X.length).toBeGreaterThan(0.9);
    expect(result!.predictions.every((prediction) => prediction !== null)).toBe(true);
  });

  it("ne se laisse pas flatter par un trait propre à chaque commune", () => {
    // Chaque commune ne cultive qu'une culture et n'a qu'un sol : le sol suffit au modèle pour
    // « reconnaître » la culture d'une commune déjà vue, pas celle d'une commune nouvelle.
    const random = seededRandom(5);
    const X: number[][] = [];
    const labels: string[] = [];
    const groups: string[] = [];
    for (let index = 0; index < 200; index += 1) {
      const commune = index % 4;
      X.push([random(), random(), commune + (random() - 0.5) * 0.1]);
      labels.push(commune % 2 === 0 ? "MAIZE" : "COTTON");
      groups.push(`C${commune}`);
    }
    const { outOfBagAccuracy } = trainRandomForest(X, labels, FEATURES, PARAMS);
    const result = crossValidateByGroup(X, labels, groups, FEATURES, PARAMS);
    const correct = result!.predictions.filter(
      (prediction, row) => prediction?.label === labels[row],
    ).length;
    expect(outOfBagAccuracy).toBeGreaterThan(0.95);
    expect(correct / X.length).toBeLessThan(0.7);
  });

  it("ne rend rien avec une seule commune, ni pour un pli sans deux cultures", () => {
    const X = [[0.1], [0.2], [0.8], [0.9]];
    expect(crossValidateByGroup(X, ["A", "A", "B", "B"], ["C", "C", "C", "C"], ["x"], PARAMS)).toBe(
      null,
    );
    // Sans la commune D, il ne reste que la culture A : la commune D n'est pas jugée.
    const result = crossValidateByGroup(
      X,
      ["A", "A", "B", "B"],
      ["C", "C", "D", "D"],
      ["x"],
      PARAMS,
    );
    expect(result?.predictions.slice(2)).toEqual([null, null]);
  });
});
