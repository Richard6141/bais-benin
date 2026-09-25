// Libellés français des valeurs du registre affichées à l'agriculteur : unités de récolte
// accordées au nombre, sous-saisons, stades de culture. Un seul formateur pour l'accueil,
// l'historique et le parcours de déclaration : aucun code brut (BAG_100KG, MAIN_RAINY)
// n'apparaît à l'écran.

/** Libellé au singulier de chaque unité, aligné sur HARVEST_UNITS (modules/registry). */
export const HARVEST_UNIT_SINGULAR: Record<string, string> = {
  KG: "kilogramme",
  T: "tonne",
  BAG_100KG: "sac de 100 kg",
  BAG_50KG: "sac de 50 kg",
  BUNCH: "régime",
  HEAP: "tas",
  BASIN: "bassine",
};

export const SUB_SEASON_LABELS: Record<string, string> = {
  MAIN_RAINY: "grande saison des pluies",
  SHORT_RAINY: "petite saison des pluies",
  DRY: "contre-saison sèche",
  ANNUAL: "culture annuelle",
};

export const CROP_STAGE_LABELS: Record<string, string> = {
  PLANNED: "prévue",
  SOWN: "semée",
  GROWING: "en croissance",
  FLOWERING: "en floraison",
  HARVESTED: "récoltée",
  FAILED: "perdue",
};

const quantityFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/**
 * Accorde un libellé d'unité au nombre : le premier mot prend la marque du pluriel au-delà
 * de 1 (« sac de 100 kg » → « sacs de 100 kg », « bassine » → « bassines ») ; les mots déjà
 * terminés par s ou x restent invariables (« tas »).
 */
export function unitLabel(unitLabelSingular: string, amount: number): string {
  if (!(amount > 1) && !(amount < -1)) return unitLabelSingular;
  const [first, ...rest] = unitLabelSingular.split(" ");
  if (!first) return unitLabelSingular;
  const plural = /[sx]$/.test(first) ? first : `${first}s`;
  return [plural, ...rest].join(" ");
}

/** Libellé d'une unité par son code, accordé au nombre ; un code inconnu reste lisible. */
export function unitLabelFor(unitCode: string, amount: number): string {
  const singular = HARVEST_UNIT_SINGULAR[unitCode] ?? unitCode.toLowerCase().replace(/_/g, " ");
  return unitLabel(singular, amount);
}

/** « 8 sacs de 100 kg », « 1 bassine », « 2,5 tonnes ». */
export function formatHarvestQuantity(amount: number, unitCode: string): string {
  return `${quantityFormatter.format(amount)} ${unitLabelFor(unitCode, amount)}`;
}

/** « 8 sacs de 100 kg de maïs » ; l'élision devant voyelle donne « d'igname », « d'arachide ». */
export function formatHarvestOf(amount: number, unitCode: string, cropName: string): string {
  const crop = cropName.toLowerCase();
  const of = /^[aeiouyhéèêàâîôû]/i.test(crop) ? "d'" : "de ";
  return `${formatHarvestQuantity(amount, unitCode)} ${of}${crop}`;
}

export function subSeasonLabel(code: string): string {
  return SUB_SEASON_LABELS[code] ?? code.toLowerCase().replace(/_/g, " ");
}

export function cropStageLabel(code: string): string {
  return CROP_STAGE_LABELS[code] ?? code.toLowerCase();
}
