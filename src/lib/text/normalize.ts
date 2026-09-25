// Normalisation de texte français pour la recherche et les vérifications de l'assistant :
// minuscules, accents retirés, apostrophes et espaces unifiés. Utilisée par l'adaptateur de
// plongements de démonstration et par les contrôles de citations (une citation doit figurer
// dans l'extrait, à la casse, aux accents et aux espaces près).

export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/[  \s]+/g, " ")
    .trim();
}

// « mais » n'y figure pas : sans accent, c'est aussi « maïs ». Les négations (ne, pas…) non plus :
// « Ne pas traiter » et « Traiter » ne doivent jamais passer pour la même phrase.
const STOP_WORDS = new Set(
  (
    "a au aux avec ce ces cette dans de des du elle en est et il ils je la le les leur leurs lui " +
    "ma me mes mon nos notre nous on ou par plus pour qu que qui sa se ses si son " +
    "sont sur ta te tes ton tu un une vos votre vous y d l s n c j m t quand comment quel quelle " +
    "quels quelles faut faire peut peux dois doit etre avoir fait mon ma mes"
  ).split(" "),
);

/** Racine grossière : pluriels et quelques terminaisons fréquentes, pour rapprocher les formes. */
function stem(word: string): string {
  let w = word;
  for (const suffix of ["ements", "ement", "ations", "ation", "euses", "euse", "eurs", "eur"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  if (w.length > 4 && (w.endsWith("s") || w.endsWith("x"))) w = w.slice(0, -1);
  // Formes verbales courantes des fiches et des questions : semer, semez, semé, séchez…
  for (const suffix of ["ez", "er", "ee", "ent", "ons", "ai", "is"]) {
    if (w.length >= suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Mots significatifs d'un texte, normalisés et racinisés, dans l'ordre. */
export function contentWords(text: string): string[] {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

/** Phrases d'un texte (fin sur . ! ? ou retour à la ligne), sans les lignes vides. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•]\s*/, "").trim())
    .filter((s) => s.length > 0);
}

const NEGATIONS = new Set([
  "ne",
  "n",
  "pas",
  "jamais",
  "sans",
  "aucun",
  "aucune",
  "ni",
  "non",
  "nullement",
  "interdit",
  "interdite",
  "interdits",
  "eviter",
  "evitez",
  "evite",
  "proscrire",
  "proscrit",
]);

/** Vrai quand une phrase est négative ou prohibitive (« ne pas », « jamais », « évitez »…). */
export function isNegated(text: string): boolean {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .some((w) => NEGATIONS.has(w));
}
