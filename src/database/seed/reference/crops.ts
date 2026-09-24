/**
 * Référentiel des 21 cultures de phase 1, d'après le §4 de docs/08-donnees-et-sources.md.
 *
 * Les rendements sont des ordres de grandeur issus des séries agrégées récentes du MAEP et de la
 * FAO ; ils sont chargés au niveau `ESTIMATED` et devront être remplacés par les valeurs
 * officielles `MAEP_DSA` dès la signature de la convention d'accès. Les fenêtres de semis et de
 * récolte sont indicatives et varient de deux à quatre semaines selon les années ; elles servent
 * de valeur par défaut au moteur d'alertes tant que les prévisions saisonnières ne sont pas
 * connectées.
 */

import type { AgroEcologicalZoneCode } from "./agro-ecological-zones";
import type { MonthWindow } from "./seasons";

export const CROP_CATEGORIES = [
  "CEREAL",
  "ROOT_TUBER",
  "LEGUME",
  "CASH_CROP",
  "VEGETABLE",
  "FRUIT",
  "OILSEED",
] as const;

export type CropCategory = (typeof CROP_CATEGORIES)[number];

/**
 * Cycle de la culture. Pour une culture pérenne, la parcelle porte une date de plantation et un
 * âge de mise en production plutôt qu'un semis par campagne ; une culture de cueillette n'a pas de
 * semis du tout (peuplements naturels de karité).
 */
export type CropCycle = "ANNUAL" | "PERENNIAL" | "GATHERED";

/**
 * Unité de commercialisation la plus courante sur les marchés. Les unités locales (bassine, tas)
 * n'ont pas de poids normalisé : un facteur de conversion indicatif vers le kilogramme sera porté
 * par la table des unités, pas par le référentiel des cultures.
 */
export type TradeUnit = "KG" | "T" | "BAG_100KG" | "BAG_50KG" | "BUNCH" | "HEAP" | "BASIN";

export interface CropCalendar {
  /**
   * Fenêtre de semis ou de plantation. Absente pour les cultures de cueillette. Pour les cultures à
   * deux campagnes au sud, seule la fenêtre de la grande saison est portée ici ; la deuxième
   * campagne se déduit de la sous-saison SHORT_RAINY des modèles de saison.
   */
  sowing?: MonthWindow;
  /** Fenêtre de récolte principale. [1, 12] signifie une récolte étalée sur toute l'année. */
  harvest: MonthWindow;
}

export interface CropReference {
  code: string;
  nameFr: string;
  category: CropCategory;
  cycle: CropCycle;
  /** Zones agro-écologiques où la culture est significative, par ordre d'importance. */
  mainZones: readonly AgroEcologicalZoneCode[];
  /** Calendrier par régime pluviométrique ; un régime absent signifie une culture non significative. */
  calendar: {
    south?: CropCalendar;
    north?: CropCalendar;
  };
  /** Rendement indicatif en tonnes par hectare, milieu de la fourchette documentée. */
  typicalYieldTPerHa: number;
  tradeUnit: TradeUnit;
  reliability: "ESTIMATED";
  sourceId: "BAIS_SEED";
}

export const CROPS: readonly CropReference[] = [
  {
    code: "MAIZE",
    nameFr: "Maïs",
    category: "CEREAL",
    cycle: "ANNUAL",
    // Culture vivrière présente dans toutes les zones : la liste couvre aussi la Donga et le littoral.
    mainZones: ["ZAE_6", "ZAE_7", "ZAE_5", "ZAE_3", "ZAE_2", "ZAE_4", "ZAE_8", "ZAE_1"],
    calendar: {
      south: { sowing: [3, 4], harvest: [7, 8] },
      north: { sowing: [5, 6], harvest: [9, 10] },
    },
    typicalYieldTPerHa: 1.35,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "RICE",
    nameFr: "Riz",
    category: "CEREAL",
    cycle: "ANNUAL",
    mainZones: ["ZAE_1", "ZAE_5", "ZAE_6", "ZAE_7", "ZAE_4"],
    calendar: {
      south: { sowing: [4, 5], harvest: [8, 9] },
      north: { sowing: [6, 7], harvest: [10, 11] },
    },
    // Moyenne entre pluvial (1,5 à 2,5) et irrigué (3,0 à 4,5), le pluvial de bas-fond dominant.
    typicalYieldTPerHa: 2.5,
    tradeUnit: "BAG_50KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "SORGHUM",
    nameFr: "Sorgho",
    category: "CEREAL",
    cycle: "ANNUAL",
    mainZones: ["ZAE_1", "ZAE_2", "ZAE_4"],
    calendar: {
      north: { sowing: [5, 6], harvest: [10, 11] },
    },
    typicalYieldTPerHa: 1.05,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "MILLET",
    nameFr: "Mil",
    category: "CEREAL",
    cycle: "ANNUAL",
    mainZones: ["ZAE_1", "ZAE_2", "ZAE_4"],
    calendar: {
      north: { sowing: [5, 6], harvest: [9, 10] },
    },
    typicalYieldTPerHa: 0.85,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "CASSAVA",
    nameFr: "Manioc",
    category: "ROOT_TUBER",
    cycle: "ANNUAL",
    mainZones: ["ZAE_6", "ZAE_7", "ZAE_5", "ZAE_8", "ZAE_3"],
    // Récolte 9 à 18 mois après plantation : la fenêtre porte sur la campagne suivante.
    calendar: {
      south: { sowing: [3, 5], harvest: [12, 5] },
      north: { sowing: [5, 6], harvest: [2, 6] },
    },
    typicalYieldTPerHa: 14,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "YAM",
    nameFr: "Igname",
    category: "ROOT_TUBER",
    cycle: "ANNUAL",
    mainZones: ["ZAE_3", "ZAE_4", "ZAE_5"],
    // Buttage en saison sèche ; récolte précoce août-septembre au centre, tardive novembre-janvier
    // au nord.
    calendar: {
      south: { sowing: [12, 2], harvest: [8, 9] },
      north: { sowing: [1, 3], harvest: [11, 1] },
    },
    typicalYieldTPerHa: 12,
    tradeUnit: "HEAP",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "SWEET_POTATO",
    nameFr: "Patate douce",
    category: "ROOT_TUBER",
    cycle: "ANNUAL",
    mainZones: ["ZAE_6", "ZAE_8", "ZAE_3"],
    calendar: {
      south: { sowing: [3, 4], harvest: [6, 8] },
      north: { sowing: [6, 7], harvest: [9, 11] },
    },
    typicalYieldTPerHa: 6.5,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "COWPEA",
    nameFr: "Niébé",
    category: "LEGUME",
    cycle: "ANNUAL",
    mainZones: ["ZAE_6", "ZAE_5", "ZAE_2", "ZAE_3"],
    calendar: {
      south: { sowing: [3, 4], harvest: [6, 7] },
      north: { sowing: [6, 7], harvest: [9, 10] },
    },
    typicalYieldTPerHa: 0.75,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "GROUNDNUT",
    nameFr: "Arachide",
    category: "OILSEED",
    cycle: "ANNUAL",
    mainZones: ["ZAE_2", "ZAE_3", "ZAE_4", "ZAE_5", "ZAE_6"],
    calendar: {
      south: { sowing: [3, 4], harvest: [7, 7] },
      north: { sowing: [5, 6], harvest: [9, 10] },
    },
    // Rendement en coque.
    typicalYieldTPerHa: 0.95,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "SOYBEAN",
    nameFr: "Soja",
    category: "LEGUME",
    cycle: "ANNUAL",
    mainZones: ["ZAE_3", "ZAE_5", "ZAE_2"],
    calendar: {
      north: { sowing: [6, 7], harvest: [10, 11] },
    },
    typicalYieldTPerHa: 1,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "COTTON",
    nameFr: "Coton",
    category: "CASH_CROP",
    cycle: "ANNUAL",
    mainZones: ["ZAE_2", "ZAE_5", "ZAE_3"],
    calendar: {
      north: { sowing: [5, 6], harvest: [11, 1] },
    },
    // Rendement en coton-graine ; prix garanti par campagne, d'où la vente au kilogramme.
    typicalYieldTPerHa: 1.15,
    tradeUnit: "KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "CASHEW",
    nameFr: "Anacarde",
    category: "CASH_CROP",
    cycle: "PERENNIAL",
    mainZones: ["ZAE_5", "ZAE_3", "ZAE_4"],
    // Plantation en saison des pluies, production après 3 à 5 ans ; récolte de noix brute de
    // février à mai, rattachée à la campagne en cours.
    calendar: {
      south: { sowing: [4, 6], harvest: [2, 5] },
      north: { sowing: [6, 8], harvest: [2, 5] },
    },
    typicalYieldTPerHa: 0.5,
    tradeUnit: "KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "PINEAPPLE",
    nameFr: "Ananas",
    category: "FRUIT",
    cycle: "PERENNIAL",
    mainZones: ["ZAE_6"],
    // Plantation possible toute l'année avec un pic de mars à mai ; récolte 12 à 18 mois après.
    calendar: {
      south: { sowing: [3, 5], harvest: [1, 12] },
    },
    typicalYieldTPerHa: 50,
    tradeUnit: "T",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "OIL_PALM",
    nameFr: "Palmier à huile",
    category: "OILSEED",
    cycle: "PERENNIAL",
    mainZones: ["ZAE_6", "ZAE_8", "ZAE_7"],
    // Production après 3 à 4 ans, récolte toute l'année avec un pic de février à mai.
    calendar: {
      south: { sowing: [4, 7], harvest: [2, 5] },
    },
    // Rendement en régimes, très dépendant du matériel végétal (3 à 8 t/ha).
    typicalYieldTPerHa: 5.5,
    tradeUnit: "KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "SHEA",
    nameFr: "Karité",
    category: "OILSEED",
    cycle: "GATHERED",
    mainZones: ["ZAE_4", "ZAE_2", "ZAE_3", "ZAE_5"],
    // Peuplements naturels : pas de semis, ramassage des noix de mai à août.
    calendar: {
      north: { harvest: [5, 8] },
    },
    // Rendement en amandes par hectare de parc.
    typicalYieldTPerHa: 0.2,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "SESAME",
    nameFr: "Sésame",
    category: "OILSEED",
    cycle: "ANNUAL",
    mainZones: ["ZAE_3", "ZAE_2", "ZAE_4", "ZAE_5"],
    calendar: {
      north: { sowing: [6, 7], harvest: [10, 11] },
    },
    typicalYieldTPerHa: 0.4,
    tradeUnit: "BAG_50KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "TOMATO",
    nameFr: "Tomate",
    category: "VEGETABLE",
    cycle: "ANNUAL",
    mainZones: ["ZAE_8", "ZAE_6", "ZAE_5", "ZAE_1"],
    // Au sud, culture toute l'année avec des pics de semis en mars et septembre ; au nord, en
    // contre-saison irriguée avec récolte 2 à 3 mois après repiquage.
    calendar: {
      south: { sowing: [1, 12], harvest: [1, 12] },
      north: { sowing: [10, 11], harvest: [12, 2] },
    },
    typicalYieldTPerHa: 11.5,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "CHILI",
    nameFr: "Piment",
    category: "VEGETABLE",
    cycle: "ANNUAL",
    mainZones: ["ZAE_6", "ZAE_8", "ZAE_7"],
    calendar: {
      south: { sowing: [3, 4], harvest: [6, 8] },
      north: { sowing: [5, 6], harvest: [8, 10] },
    },
    typicalYieldTPerHa: 4.5,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "OKRA",
    nameFr: "Gombo",
    category: "VEGETABLE",
    cycle: "ANNUAL",
    mainZones: ["ZAE_6", "ZAE_7", "ZAE_3"],
    calendar: {
      south: { sowing: [3, 4], harvest: [5, 7] },
      north: { sowing: [6, 7], harvest: [8, 10] },
    },
    typicalYieldTPerHa: 6,
    tradeUnit: "BASIN",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "ONION",
    nameFr: "Oignon",
    category: "VEGETABLE",
    cycle: "ANNUAL",
    mainZones: ["ZAE_1", "ZAE_4", "ZAE_8", "ZAE_6"],
    // Culture de contre-saison irriguée dans les deux régimes ; le bassin de Malanville domine.
    calendar: {
      south: { sowing: [10, 12], harvest: [2, 4] },
      north: { sowing: [10, 11], harvest: [2, 4] },
    },
    typicalYieldTPerHa: 20,
    tradeUnit: "BAG_100KG",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
  {
    code: "PLANTAIN",
    nameFr: "Banane plantain",
    category: "FRUIT",
    cycle: "PERENNIAL",
    mainZones: ["ZAE_6", "ZAE_8", "ZAE_7"],
    // Première récolte 10 à 14 mois après plantation, puis production continue.
    calendar: {
      south: { sowing: [3, 5], harvest: [1, 12] },
    },
    typicalYieldTPerHa: 8,
    tradeUnit: "BUNCH",
    reliability: "ESTIMATED",
    sourceId: "BAIS_SEED",
  },
];
