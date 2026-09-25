// Masquage des petits effectifs (docs/06 §3, règle 4 ; pilotage-parcours-ux §0). Toute ligne
// agrégée qui résume entre 1 et k − 1 exploitations est masquée avec toutes ses mesures, pour
// qu'aucune exploitation ne soit reconnaissable ; une ligne à zéro reste visible (« aucune
// exploitation »). Masquage secondaire : quand le total d'un groupe est affiché et qu'une seule
// ligne y est masquée, la plus petite ligne visible non nulle l'est aussi, sinon le total moins
// les lignes visibles redonnerait la valeur cachée. Appliqué par chaque service avant tout
// retour, jamais dans l'interface.

export const K_ANONYMITY = 5;

export type MaskedRow<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null } & {
  masked: boolean;
};

export interface MaskOptions<T, K extends keyof T> {
  /** Effectif d'exploitations résumé par la ligne. */
  count: (row: T) => number;
  /** Champs effacés sur une ligne masquée (effectif compris). */
  fields: readonly K[];
  k?: number;
  /** Vrai quand le total du groupe est affiché à côté des lignes. */
  groupTotal?: boolean;
}

export function isSmallCell(count: number, k: number = K_ANONYMITY): boolean {
  return count > 0 && count < k;
}

export function maskSmallCells<T extends object, K extends keyof T>(
  rows: readonly T[],
  options: MaskOptions<T, K>,
): MaskedRow<T, K>[] {
  const k = options.k ?? K_ANONYMITY;
  const hidden = new Set<number>();
  rows.forEach((row, index) => {
    if (isSmallCell(options.count(row), k)) hidden.add(index);
  });

  if (options.groupTotal && hidden.size === 1) {
    let smallest = -1;
    rows.forEach((row, index) => {
      const count = options.count(row);
      if (hidden.has(index) || count === 0) return;
      if (smallest < 0 || count < options.count(rows[smallest]!)) smallest = index;
    });
    if (smallest >= 0) hidden.add(smallest);
  }

  return rows.map((row, index) => {
    const copy: Record<string, unknown> = { ...row, masked: hidden.has(index) };
    if (hidden.has(index)) for (const field of options.fields) copy[field as string] = null;
    return copy as MaskedRow<T, K>;
  });
}

/** Masquage d'une ligne seule (tuiles d'un périmètre) : pas de total de groupe. */
export function maskSingle<T extends object, K extends keyof T>(
  row: T,
  options: Omit<MaskOptions<T, K>, "groupTotal">,
): MaskedRow<T, K> {
  return maskSmallCells([row], options)[0]!;
}
