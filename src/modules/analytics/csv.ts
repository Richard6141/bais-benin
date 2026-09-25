// CSV lisible directement par Excel en français (pilotage-parcours-ux §2.E) : UTF-8 avec BOM,
// séparateur « ; », virgule décimale, fins de ligne CRLF, en-têtes en français. Une cellule
// vide signifie « donnée absente ou masquée » ; la colonne masque_k dit laquelle.

export type CsvCell = string | number | boolean | null;

const BOM = String.fromCharCode(0xfeff);

/** Nombre à la virgule décimale, `digits` décimales au plus ; vide pour null. */
export function decimal(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "";
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor).replace(".", ",");
}

function cell(value: CsvCell): string {
  if (value === null) return "";
  let text = typeof value === "number" ? decimal(value, 6) : String(value);
  // Pas de formule interprétée par le tableur : un texte qui commence par = + - @, une
  // tabulation ou un retour chariot est préfixé, sauf s'il est un nombre strict (« -12,5 »).
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(?:[.,]\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatCsv(headers: readonly string[], rows: readonly CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(";"));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
