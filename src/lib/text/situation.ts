// Phrases de situation des accueils d'espace : un nombre et son nom accordé, puis une phrase qui
// ne cite que ce qui n'est pas nul. Pures, pour être testées sans base.

const integer = new Intl.NumberFormat("fr-FR");

/** « 1 alerte », « 3 alertes », « 1 200 exploitations ». */
export function countLabel(count: number, one: string, many: string): string {
  return `${integer.format(count)} ${count > 1 ? many : one}`;
}

export interface SituationPart {
  count: number;
  one: string;
  many: string;
}

/**
 * « À Djougou : 2 alertes en cours, 14 exploitations à vérifier. » Les parts à zéro sont omises ;
 * sans aucune part, la phrase calme est rendue telle quelle.
 */
export function situationSentence(
  place: string | null,
  parts: readonly SituationPart[],
  calm: string,
): string {
  const listed = parts
    .filter((part) => part.count > 0)
    .map((part) => countLabel(part.count, part.one, part.many));
  if (listed.length === 0) return calm;
  const head =
    listed.length === 1 ? listed[0]! : `${listed.slice(0, -1).join(", ")} et ${listed.at(-1)}`;
  return place ? `À ${place} : ${head}.` : `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}
