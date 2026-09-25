// Libellés français des codes lus dans les conditions de liste (cultures, stades, zones), pour que
// l'explication d'une alerte ne montre jamais un code technique au producteur.

export const STAGE_LABELS: Record<string, string> = {
  PLANNED: "prévue",
  SOWN: "semée",
  GROWING: "en croissance",
  FLOWERING: "en floraison",
  HARVESTED: "récoltée",
  FAILED: "perdue",
};

export const CROP_LABELS: Record<string, string> = {
  MAIZE: "maïs",
  RICE: "riz",
  SORGHUM: "sorgho",
  MILLET: "mil",
  CASSAVA: "manioc",
  YAM: "igname",
  SWEET_POTATO: "patate douce",
  COWPEA: "niébé",
  GROUNDNUT: "arachide",
  SOYBEAN: "soja",
  COTTON: "coton",
  CASHEW: "anacarde",
  PINEAPPLE: "ananas",
  OIL_PALM: "palmier à huile",
  SHEA: "karité",
  SESAME: "sésame",
  TOMATO: "tomate",
  CHILI: "piment",
  OKRA: "gombo",
  ONION: "oignon",
  PLANTAIN: "banane plantain",
};

export function labelForCode(code: string): string {
  if (/^ZAE_\d+$/.test(code)) return `zone agro-écologique ${code.slice(4)}`;
  return STAGE_LABELS[code] ?? CROP_LABELS[code] ?? code;
}
