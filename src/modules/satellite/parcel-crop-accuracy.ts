import { z } from "zod";
import { CROP_GROUPS } from "./crop-groups";

// Précision du modèle de culture par parcelle (ADR-0032), en fonctions pures : matrice de
// confusion par classe du modèle, taux par culture et marge d'erreur de la précision globale.

/** Même seuil que la précision de la carte des pixels : sous dix parcelles, pas de taux. */
const MIN_PARCELS_FOR_RATE = 10;

/** Nombre de parcelles d'une culture de référence classées dans une culture mesurée. */
export interface GroupPair {
  reference: string;
  predicted: string;
  count: number;
}

/**
 * Intervalle de Wilson à 95 % d'une proportion : juste même près de 0 ou de 1 et sur peu de
 * parcelles, là où l'écart type classique donne des bornes hors de [0, 1].
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (total <= 0) return null;
  const p = successes / total;
  const z2 = z * z;
  const centre = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface CropGroupAccuracy {
  group: string;
  /** Parcelles de référence de cette culture. */
  parcels: number;
  correct: number;
  /** Part des parcelles de la culture que le modèle reconnaît (exactitude du producteur). */
  recall: number | null;
  /** Part des parcelles classées dans la culture qui la cultivent (exactitude de l'usager). */
  precision: number | null;
  mainConfusion: { predicted: string; share: number } | null;
}

export interface GroupConfusion {
  judged: number;
  correct: number;
  accuracy: number | null;
  /** Intervalle de confiance à 95 % de la précision globale. */
  interval: { low: number; high: number } | null;
  classes: CropGroupAccuracy[];
  /** Lignes : culture de référence ; colonnes : culture mesurée. */
  rows: { reference: string; counts: Record<string, number> }[];
  columns: string[];
}

const GROUP_ORDER = CROP_GROUPS.map((group) => group.key as string);

function ordered(keys: Iterable<string>): string[] {
  const rank = (key: string) => {
    const index = GROUP_ORDER.indexOf(key);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Matrice de confusion et taux par culture, à partir des paires comptées. */
export function groupConfusion(pairs: readonly GroupPair[]): GroupConfusion {
  const references = ordered(pairs.map((pair) => pair.reference));
  const columns = ordered(pairs.filter((pair) => pair.count > 0).map((pair) => pair.predicted));
  const rows = new Map(
    references.map((reference) => [
      reference,
      Object.fromEntries(columns.map((key) => [key, 0])) as Record<string, number>,
    ]),
  );
  const columnTotals = new Map<string, number>();
  let judged = 0;
  let correct = 0;
  for (const pair of pairs) {
    const row = rows.get(pair.reference)!;
    row[pair.predicted] = (row[pair.predicted] ?? 0) + pair.count;
    columnTotals.set(pair.predicted, (columnTotals.get(pair.predicted) ?? 0) + pair.count);
    judged += pair.count;
    if (pair.reference === pair.predicted) correct += pair.count;
  }
  const rate = (part: number, whole: number) =>
    whole >= MIN_PARCELS_FOR_RATE ? part / whole : null;
  const classes = [...rows.entries()].map(([reference, counts]) => {
    const parcels = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const hits = counts[reference] ?? 0;
    let mainConfusion: CropGroupAccuracy["mainConfusion"] = null;
    for (const [predicted, value] of Object.entries(counts)) {
      if (predicted === reference || value === 0) continue;
      if (!mainConfusion || value > mainConfusion.share * parcels) {
        mainConfusion = { predicted, share: value / parcels };
      }
    }
    return {
      group: reference,
      parcels,
      correct: hits,
      recall: rate(hits, parcels),
      precision: rate(hits, columnTotals.get(reference) ?? 0),
      mainConfusion,
    };
  });
  const enough = judged >= MIN_PARCELS_FOR_RATE;
  return {
    judged,
    correct,
    accuracy: enough ? correct / judged : null,
    interval: enough ? wilsonInterval(correct, judged) : null,
    classes,
    rows: [...rows.entries()].map(([reference, counts]) => ({ reference, counts })),
    columns,
  };
}

/** Paires comptées à partir de la référence et de la culture mesurée de chaque parcelle. */
export function countPairs(
  entries: readonly { reference: string; predicted: string | null }[],
): GroupPair[] {
  const counts = new Map<string, GroupPair>();
  for (const entry of entries) {
    if (entry.predicted === null) continue;
    const key = `${entry.reference}:${entry.predicted}`;
    const pair = counts.get(key) ?? {
      reference: entry.reference,
      predicted: entry.predicted,
      count: 0,
    };
    pair.count += 1;
    counts.set(key, pair);
  }
  return [...counts.values()];
}

/**
 * Validation croisée par commune gardée dans les métriques du modèle (`crop_model.metrics`) : de
 * quoi refaire la matrice à l'écran sans réentraîner.
 */
export const crossValidationSchema = z.object({
  by: z.literal("commune"),
  folds: z.number(),
  accuracy: z.number().nullable(),
  pairs: z.array(z.object({ reference: z.string(), predicted: z.string(), count: z.number() })),
  /** Parcelles dont la confiance atteint le seuil de l'accord (0,6), et combien sont justes. */
  confident: z.object({ judged: z.number(), correct: z.number() }),
  communes: z.array(z.object({ code: z.string(), judged: z.number(), correct: z.number() })),
});

export type CrossValidationMetrics = z.infer<typeof crossValidationSchema>;

/** Résume les prédictions hors commune de chaque parcelle d'entraînement. */
export function crossValidationMetrics(
  folds: number,
  entries: readonly {
    reference: string;
    commune: string;
    predicted: { label: string; confidence: number } | null;
  }[],
  confidentFrom: number,
): CrossValidationMetrics {
  const pairs = countPairs(
    entries.map((entry) => ({
      reference: entry.reference,
      predicted: entry.predicted?.label ?? null,
    })),
  );
  const communes = new Map<string, { judged: number; correct: number }>();
  const confident = { judged: 0, correct: 0 };
  for (const entry of entries) {
    if (!entry.predicted) continue;
    const hit = entry.predicted.label === entry.reference ? 1 : 0;
    const commune = communes.get(entry.commune) ?? { judged: 0, correct: 0 };
    commune.judged += 1;
    commune.correct += hit;
    communes.set(entry.commune, commune);
    if (entry.predicted.confidence >= confidentFrom) {
      confident.judged += 1;
      confident.correct += hit;
    }
  }
  return {
    by: "commune",
    folds,
    accuracy: groupConfusion(pairs).accuracy,
    pairs,
    confident,
    communes: [...communes.entries()]
      .map(([code, figures]) => ({ code, ...figures }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}
