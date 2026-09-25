// Tri des tableaux d'agrégats : les valeurs absentes (masquées par le secret statistique ou
// sans donnée) restent en bas quel que soit le sens, et le tri est stable.

export type SortDirection = "ascending" | "descending";
export type SortValue = number | string | null;

export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
  return direction === "ascending" ? order : -order;
}

export function sortRows<T>(
  rows: readonly T[],
  valueOf: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  // Tri stable : à valeur égale, l'ordre du service (alphabétique) est conservé.
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) => compareSortValues(valueOf(a.row), valueOf(b.row), direction) || a.index - b.index,
    )
    .map((entry) => entry.row);
}
