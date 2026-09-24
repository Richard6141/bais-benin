/**
 * Zones agro-écologiques (ZAE) du Bénin, d'après le zonage INRAB / MAEP repris au §3 de
 * docs/08-donnees-et-sources.md.
 *
 * Les contours réels des ZAE sont agronomiques et ne suivent pas les limites communales : une
 * commune peut chevaucher deux zones. En phase 1, on rattache chaque département aux zones qu'il
 * couvre principalement ; un département apparaît donc dans plusieurs zones (l'Alibori est à la
 * fois en ZAE_1 et ZAE_2, le Zou en ZAE_5, ZAE_6 et ZAE_7). Le rattachement fin par commune puis
 * par parcelle viendra avec les géométries ZAE officielles.
 */

/** Codes ISO 3166-2:BJ des 12 départements, préfixés par le pays. */
export const DEPARTEMENT_CODES = [
  "BJ-AL", // Alibori
  "BJ-AK", // Atacora
  "BJ-AQ", // Atlantique
  "BJ-BO", // Borgou
  "BJ-CO", // Collines
  "BJ-KO", // Couffo
  "BJ-DO", // Donga
  "BJ-LI", // Littoral
  "BJ-MO", // Mono
  "BJ-OU", // Ouémé
  "BJ-PL", // Plateau
  "BJ-ZO", // Zou
] as const;

export type DepartementCode = (typeof DEPARTEMENT_CODES)[number];

export const AGRO_ECOLOGICAL_ZONE_CODES = [
  "ZAE_1",
  "ZAE_2",
  "ZAE_3",
  "ZAE_4",
  "ZAE_5",
  "ZAE_6",
  "ZAE_7",
  "ZAE_8",
] as const;

export type AgroEcologicalZoneCode = (typeof AGRO_ECOLOGICAL_ZONE_CODES)[number];

/**
 * Régime pluviométrique : une seule saison des pluies au nord (unimodal), deux au sud (bimodal).
 * La ZAE_5 est une zone de transition autour du 8e parallèle ; elle est classée unimodale car la
 * petite saison sèche y est trop peu marquée pour conduire deux campagnes distinctes de façon
 * fiable, ce qui est le critère opérationnel pour le moteur d'alertes.
 */
export type RainfallRegime = "BIMODAL" | "UNIMODAL";

export interface AgroEcologicalZoneReference {
  code: AgroEcologicalZoneCode;
  name: string;
  rainfallRegime: RainfallRegime;
  /** Départements principalement couverts, sans prétendre à une couverture exclusive. */
  departementCodes: readonly DepartementCode[];
  /** Cultures et activités dominantes, dans l'ordre d'importance usuel. */
  dominantSystems: readonly string[];
  /** Fourchette pluviométrique annuelle indicative, en millimètres. */
  indicativeRainfallMm: readonly [min: number, max: number];
}

export const AGRO_ECOLOGICAL_ZONES: readonly AgroEcologicalZoneReference[] = [
  {
    code: "ZAE_1",
    name: "Extrême Nord-Bénin",
    rainfallRegime: "UNIMODAL",
    departementCodes: ["BJ-AL"],
    dominantSystems: [
      "Sorgho",
      "Mil",
      "Riz de bas-fond et irrigué (vallée du Niger)",
      "Oignon",
      "Élevage",
    ],
    indicativeRainfallMm: [700, 900],
  },
  {
    code: "ZAE_2",
    name: "Zone cotonnière du Nord-Bénin",
    rainfallRegime: "UNIMODAL",
    departementCodes: ["BJ-AL", "BJ-BO", "BJ-AK"],
    dominantSystems: ["Coton", "Maïs", "Sorgho", "Arachide", "Soja"],
    indicativeRainfallMm: [900, 1100],
  },
  {
    code: "ZAE_3",
    name: "Zone vivrière du Sud-Borgou",
    rainfallRegime: "UNIMODAL",
    departementCodes: ["BJ-BO"],
    dominantSystems: ["Igname", "Maïs", "Manioc", "Anacarde", "Soja"],
    indicativeRainfallMm: [1000, 1200],
  },
  {
    code: "ZAE_4",
    name: "Zone Ouest-Atacora",
    rainfallRegime: "UNIMODAL",
    departementCodes: ["BJ-AK", "BJ-DO"],
    dominantSystems: ["Sorgho", "Mil", "Fonio", "Riz de bas-fond", "Igname", "Karité"],
    indicativeRainfallMm: [1000, 1300],
  },
  {
    code: "ZAE_5",
    name: "Zone cotonnière du Centre-Bénin",
    rainfallRegime: "UNIMODAL",
    departementCodes: ["BJ-CO", "BJ-ZO", "BJ-DO"],
    dominantSystems: ["Coton", "Maïs", "Igname", "Manioc", "Anacarde"],
    indicativeRainfallMm: [1100, 1200],
  },
  {
    code: "ZAE_6",
    name: "Zone des terres de barre",
    rainfallRegime: "BIMODAL",
    departementCodes: ["BJ-AQ", "BJ-OU", "BJ-PL", "BJ-KO", "BJ-MO", "BJ-ZO"],
    dominantSystems: [
      "Maïs",
      "Manioc",
      "Niébé",
      "Arachide",
      "Palmier à huile",
      "Ananas",
      "Maraîchage",
    ],
    indicativeRainfallMm: [1100, 1400],
  },
  {
    code: "ZAE_7",
    name: "Zone de la dépression (Lama)",
    rainfallRegime: "BIMODAL",
    departementCodes: ["BJ-ZO", "BJ-KO", "BJ-PL", "BJ-AQ"],
    dominantSystems: ["Maïs", "Riz de bas-fond", "Manioc", "Maraîchage sur vertisols"],
    indicativeRainfallMm: [1100, 1300],
  },
  {
    code: "ZAE_8",
    name: "Zone des pêcheries",
    rainfallRegime: "BIMODAL",
    departementCodes: ["BJ-LI", "BJ-OU", "BJ-MO", "BJ-AQ"],
    dominantSystems: ["Pêche lagunaire", "Maraîchage périurbain", "Cocotier", "Manioc"],
    indicativeRainfallMm: [1200, 1500],
  },
];
