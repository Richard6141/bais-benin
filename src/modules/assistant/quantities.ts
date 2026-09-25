import { foldText } from "@/lib/text/normalize";

// Repérage des quantités dans une réponse et dans les extraits (revue de sécurité, étape 8) :
// nombres en chiffres (« 1,5 », « 30 000 ») ou en lettres courantes (« deux », « vingt-cinq »),
// suivis d'une unité (kg, l, sac, % …). Les valeurs sont comparées numériquement, avec leurs
// bornes : « 1 l/ha » ne correspond ni à « 11 l/ha » ni à « 0,1 l/ha ». Un nombre sans unité
// n'est contrôlé que si la réponse parle de dose, de produit, de surface traitée ou de délai
// avant récolte : alors tout nombre en chiffres doit venir d'un extrait cité (refus en cas de doute).

export interface Quantity {
  value: number;
  /** Unité canonique (kg, l, sac, pct, jour, cm …), ou null pour un nombre seul. */
  unit: string | null;
  /** Vrai quand l'unité est celle d'une dose (masse, volume, contenant, concentration). */
  doseUnit: boolean;
  /** Nombre écrit en lettres. */
  spelled: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  cent: 100,
  cents: 100,
  mille: 1000,
  demi: 0.5,
  demie: 0.5,
};

const UNITS: Record<string, { unit: string; dose: boolean }> = {};
function units(names: string[], unit: string, dose: boolean) {
  for (const name of names) UNITS[name] = { unit, dose };
}
units(["kg", "kilo", "kilos", "kilogramme", "kilogrammes"], "kg", true);
units(["g", "gr", "gramme", "grammes"], "g", true);
units(["t", "tonne", "tonnes"], "t", true);
units(["l", "litre", "litres"], "l", true);
units(["ml", "millilitre", "millilitres"], "ml", true);
units(["cl", "centilitre", "centilitres"], "cl", true);
units(["cc"], "cc", true);
units(["sac", "sacs"], "sac", true);
units(["sachet", "sachets"], "sachet", true);
units(["bouchon", "bouchons", "capsule", "capsules"], "bouchon", true);
units(["cuillere", "cuilleres", "cuilleree", "cuillerees"], "cuillere", true);
units(["boite", "boites", "pot", "pots"], "boite", true);
units(
  ["comprime", "comprimes", "tablette", "tablettes", "pastille", "pastilles"],
  "comprime",
  true,
);
units(["pct"], "pct", true);
units(["ec", "sc", "wp", "sl", "wg", "ew", "ul"], "formulation", true);
units(["ha", "hectare", "hectares"], "ha", false);
units(["cm", "centimetre", "centimetres"], "cm", false);
units(["mm", "millimetre", "millimetres"], "mm", false);
units(["m", "metre", "metres", "m2"], "m", false);
units(["jour", "jours", "j"], "jour", false);
units(["semaine", "semaines"], "semaine", false);
units(["mois"], "mois", false);
units(["heure", "heures", "h"], "heure", false);
units(["plant", "plants", "pied", "pieds"], "plant", false);
units(["graine", "graines"], "graine", false);
units(["poquet", "poquets"], "poquet", false);

/** Mots qu'on saute entre un nombre et son unité : « 50 kg d'urée », « deux grandes cuillères ». */
const FILLERS = new Set([
  "de",
  "d",
  "du",
  "des",
  "grand",
  "grands",
  "grande",
  "grandes",
  "petit",
  "petite",
  "petits",
  "petites",
]);

const DOSE_CONTEXT =
  /\b(?:doses?|dosage|uree|npk|engrais|insecticides?|herbicides?|fongicides?|pesticides?|nematicides?|produits?|matiere active|traitements?|trait(?:er|ez|e)|pulveris\w*|epand\w*|melang\w*|dilu\w*|par hectare|a l'hectare|l'hectare|par ha|avant (?:la |de )?recolt\w*|delai)\b|\/\s*ha\b|pour \S+ (?:l|litres?)\b/;

function tokens(text: string): string[] {
  const folded = foldText(text)
    .replace(/%/g, " pct ")
    .replace(/(\d)\s*\/\s*/g, "$1 / ");
  return folded.match(/\d+(?:[.,]\d+)?|[a-z0-9]+|\//g) ?? [];
}

const isDigits = (token: string) => /^\d+(?:[.,]\d+)?$/.test(token);

export function extractQuantities(text: string): Quantity[] {
  const list = tokens(text);
  const found: Quantity[] = [];
  for (let i = 0; i < list.length; i += 1) {
    let value: number | null = null;
    let spelled = false;
    let j = i;
    if (isDigits(list[i]!)) {
      let digits = list[i]!;
      // Milliers séparés par une espace : « 30 000 », « 12 300 ».
      if (/^\d{1,3}$/.test(digits)) {
        while (/^\d{3}$/.test(list[j + 1] ?? "")) {
          digits += list[j + 1];
          j += 1;
        }
      }
      value = Number(digits.replace(",", "."));
    } else if (list[i]! in NUMBER_WORDS) {
      spelled = true;
      let total = 0;
      let current = 0;
      while (j < list.length && list[j]! in NUMBER_WORDS) {
        const word = NUMBER_WORDS[list[j]!]!;
        if (word === 1000) {
          total += (current || 1) * 1000;
          current = 0;
        } else if (word === 100) current = (current || 1) * 100;
        else current += word;
        j += 1;
      }
      value = total + current;
      j -= 1;
    }
    if (value === null || !Number.isFinite(value)) continue;
    let k = j + 1;
    while (k < list.length && FILLERS.has(list[k]!) && k <= j + 2) k += 1;
    const unit = UNITS[list[k] ?? ""];
    // « un », « une » sans unité sont des articles, pas des nombres.
    if (spelled && !unit) {
      i = j;
      continue;
    }
    found.push({ value, unit: unit?.unit ?? null, doseUnit: unit?.dose ?? false, spelled });
    i = unit ? k : j;
  }
  return found;
}

export function mentionsDose(text: string): boolean {
  return DOSE_CONTEXT.test(foldText(text));
}

/**
 * Quantités d'une réponse que les extraits cités ne portent pas : `unsafe` pour une dose (unité
 * de dose, ou réponse qui parle de dose, de produit ou de délai avant récolte), `unsupported`
 * pour les autres (un écartement inventé, par exemple).
 */
export function checkQuantities(
  texts: readonly string[],
  sources: readonly string[],
): { unsafe: Quantity[]; unsupported: Quantity[] } {
  const answer = texts.join(" ");
  const doseTalk = mentionsDose(answer);
  const known = sources.flatMap(extractQuantities);
  const unsafe: Quantity[] = [];
  const unsupported: Quantity[] = [];
  for (const q of extractQuantities(answer)) {
    const checked = q.unit !== null || (doseTalk && !q.spelled);
    if (!checked) continue;
    const backed =
      q.unit !== null
        ? known.some((s) => s.value === q.value && s.unit === q.unit)
        : known.some((s) => s.value === q.value);
    if (backed) continue;
    if (q.doseUnit || doseTalk) unsafe.push(q);
    else unsupported.push(q);
  }
  return { unsafe, unsupported };
}
