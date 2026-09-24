// Codes stables des communes : BJ-<DEP>-<NNN> (docs/08 §2.1).
// <DEP> est une abréviation à trois lettres du département, <NNN> le rang alphabétique
// de la commune dans son département. Le code ne change jamais, même si un libellé évolue.

export const DEPARTEMENT_ABBREVIATIONS: Readonly<Record<string, string>> = {
  "BJ-AL": "ALI",
  "BJ-AK": "ATA",
  "BJ-AQ": "ATL",
  "BJ-BO": "BOR",
  "BJ-CO": "COL",
  "BJ-KO": "COU",
  "BJ-DO": "DON",
  "BJ-LI": "LIT",
  "BJ-MO": "MON",
  "BJ-OU": "OUE",
  "BJ-PL": "PLA",
  "BJ-ZO": "ZOU",
};

// Codes ISO par libellé officiel : geoBoundaries ne renseigne pas l'ISO de tous les départements.
export const DEPARTEMENT_ISO_BY_NAME: Readonly<Record<string, string>> = {
  Alibori: "BJ-AL",
  Atacora: "BJ-AK",
  Atlantique: "BJ-AQ",
  Borgou: "BJ-BO",
  Collines: "BJ-CO",
  Couffo: "BJ-KO",
  Donga: "BJ-DO",
  Littoral: "BJ-LI",
  Mono: "BJ-MO",
  Ouémé: "BJ-OU",
  Plateau: "BJ-PL",
  Zou: "BJ-ZO",
};

// Chefs-lieux officiels des départements (docs/08 §2.1).
export const DEPARTEMENT_CHEF_LIEUX: Readonly<Record<string, string>> = {
  "BJ-AL": "Kandi",
  "BJ-AK": "Natitingou",
  "BJ-AQ": "Allada",
  "BJ-BO": "Parakou",
  "BJ-CO": "Dassa-Zoumè",
  "BJ-KO": "Aplahoué",
  "BJ-DO": "Djougou",
  "BJ-LI": "Cotonou",
  "BJ-MO": "Lokossa",
  "BJ-OU": "Porto-Novo",
  "BJ-PL": "Pobè",
  "BJ-ZO": "Abomey",
};

// Le tri alphabétique ignore accents et casse pour être stable quelle que soit la locale.
export function sortKey(label: string): string {
  return label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function buildCommuneCode(departementIsoCode: string, rank: number): string {
  const abbreviation = DEPARTEMENT_ABBREVIATIONS[departementIsoCode];
  if (!abbreviation) {
    throw new Error(`Département inconnu : ${departementIsoCode}`);
  }
  return `BJ-${abbreviation}-${String(rank).padStart(3, "0")}`;
}

// Attribue les codes à une liste de communes d'un même département, par ordre alphabétique.
export function assignCommuneCodes<T extends { name: string }>(
  departementIsoCode: string,
  communes: readonly T[],
): Array<T & { code: string }> {
  return [...communes]
    .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
    .map((commune, index) => ({
      ...commune,
      code: buildCommuneCode(departementIsoCode, index + 1),
    }));
}
