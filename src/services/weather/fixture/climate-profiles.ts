/**
 * Profils climatiques mensuels par zone agro-écologique du Bénin.
 *
 * Ces valeurs sont des ordres de grandeur, approchés à partir des normales 1991-2020 des stations
 * synoptiques (Malanville, Kandi, Parakou, Natitingou, Savè, Bohicon, Cotonou) et des synthèses
 * agro-climatiques nationales. Elles servent uniquement à produire des séries de démonstration
 * vraisemblables ; elles ne remplacent pas les observations de Météo-Bénin ni les archives ERA5.
 * Tout ce qui en dérive porte la fiabilité ESTIMATED.
 *
 * Repères utilisés :
 * - Extrême nord (Malanville) : environ 850 mm, régime unimodal, pic en août, harmattan sec de
 *   décembre à février, maximales de 38 à 40 °C en mars-avril.
 * - Nord cotonnier (Kandi) : environ 1 000 mm, pic en août, saison des pluies de mai à octobre.
 * - Sud-Borgou (Parakou) et Ouest-Atacora (Natitingou) : 1 100 à 1 200 mm, pic août-septembre.
 * - Centre (Savè, Savalou) : environ 1 100 mm, transition avec un fléchissement discret en août
 *   et un pic en septembre.
 * - Terres de barre, dépression de la Lama (Bohicon, Allada) : 1 100 à 1 200 mm, régime bimodal,
 *   pics en juin et en octobre, petite saison sèche en août.
 * - Littoral (Cotonou) : environ 1 300 mm, régime bimodal, pic principal en juin, pic secondaire
 *   en octobre, températures très stables (27 à 32 °C) et humidité élevée toute l'année.
 *
 * Les codes de zones reprennent ceux du référentiel `src/database/seed/reference`, redéclarés ici
 * parce que la couche `services` n'importe pas la couche `database`.
 */

export const ZONE_CODES = [
  "ZAE_1",
  "ZAE_2",
  "ZAE_3",
  "ZAE_4",
  "ZAE_5",
  "ZAE_6",
  "ZAE_7",
  "ZAE_8",
] as const;

export type ZoneCode = (typeof ZONE_CODES)[number];

export type RainfallRegime = "UNIMODAL" | "BIMODAL";

/** Normales d'un mois, de janvier (indice 0) à décembre (indice 11). */
export interface MonthlyClimate {
  /** Cumul moyen de précipitations du mois, en millimètres. */
  rainMm: number;
  /** Nombre moyen de jours avec au moins 1 mm de pluie. */
  rainDays: number;
  /** Température maximale moyenne, en degrés Celsius. */
  tmaxC: number;
  /** Température minimale moyenne, en degrés Celsius. */
  tminC: number;
  /** Évapotranspiration de référence moyenne, en millimètres par jour. */
  et0MmPerDay: number;
  /** Humidité relative moyenne, en pourcentage. */
  humidityPct: number;
}

export interface ClimateProfile {
  zone: ZoneCode;
  label: string;
  regime: RainfallRegime;
  /** Cumul annuel moyen, somme des douze mois, en millimètres. */
  annualRainMm: number;
  /** Douze entrées, janvier à décembre. */
  months: readonly MonthlyClimate[];
  reliability: "ESTIMATED";
}

/** Douze valeurs, janvier à décembre : le type impose la longueur à la compilation. */
type Twelve = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Construit les douze mois à partir de six séries parallèles, plus lisibles qu'une liste d'objets. */
function months(
  rainMm: Twelve,
  rainDays: Twelve,
  tmaxC: Twelve,
  tminC: Twelve,
  et0MmPerDay: Twelve,
  humidityPct: Twelve,
): MonthlyClimate[] {
  const result: MonthlyClimate[] = [];
  for (let index = 0; index < 12; index += 1) {
    result.push({
      rainMm: rainMm[index] ?? 0,
      rainDays: rainDays[index] ?? 0,
      tmaxC: tmaxC[index] ?? 0,
      tminC: tminC[index] ?? 0,
      et0MmPerDay: et0MmPerDay[index] ?? 0,
      humidityPct: humidityPct[index] ?? 0,
    });
  }
  return result;
}

function profile(
  zone: ZoneCode,
  label: string,
  regime: RainfallRegime,
  monthly: MonthlyClimate[],
): ClimateProfile {
  return {
    zone,
    label,
    regime,
    annualRainMm: monthly.reduce((total, month) => total + month.rainMm, 0),
    months: monthly,
    reliability: "ESTIMATED",
  };
}

export const CLIMATE_PROFILES: Readonly<Record<ZoneCode, ClimateProfile>> = {
  ZAE_1: profile(
    "ZAE_1",
    "Extrême Nord-Bénin",
    "UNIMODAL",
    months(
      [0, 0, 3, 15, 60, 110, 190, 260, 150, 40, 2, 0],
      [0, 0, 1, 2, 5, 9, 13, 16, 11, 4, 0, 0],
      [33, 36, 39, 40, 38, 34, 31, 30, 31, 34, 35, 33],
      [17, 20, 24, 27, 27, 25, 23, 23, 23, 23, 20, 17],
      [6.0, 6.8, 7.5, 7.6, 6.8, 5.5, 4.6, 4.2, 4.6, 5.4, 5.8, 5.7],
      [25, 22, 25, 38, 55, 70, 80, 84, 80, 62, 38, 28],
    ),
  ),
  ZAE_2: profile(
    "ZAE_2",
    "Zone cotonnière du Nord-Bénin",
    "UNIMODAL",
    months(
      [0, 2, 8, 30, 90, 130, 200, 270, 180, 60, 5, 0],
      [0, 1, 2, 4, 8, 11, 15, 18, 14, 6, 1, 0],
      [34, 36, 38, 38, 36, 33, 30, 29, 30, 33, 35, 34],
      [18, 21, 24, 26, 25, 23, 22, 22, 22, 22, 20, 18],
      [5.8, 6.5, 7.0, 6.9, 6.2, 5.0, 4.3, 4.0, 4.3, 5.0, 5.5, 5.4],
      [28, 26, 32, 48, 62, 74, 82, 86, 83, 70, 45, 32],
    ),
  ),
  ZAE_3: profile(
    "ZAE_3",
    "Zone vivrière du Sud-Borgou",
    "UNIMODAL",
    months(
      [2, 8, 25, 60, 120, 150, 190, 240, 220, 90, 10, 3],
      [0, 1, 3, 6, 10, 12, 15, 17, 16, 9, 1, 0],
      [34, 36, 37, 36, 34, 32, 30, 29, 30, 32, 34, 34],
      [19, 22, 24, 24, 23, 22, 22, 21, 21, 22, 21, 19],
      [5.5, 6.2, 6.5, 6.2, 5.5, 4.7, 4.1, 3.9, 4.1, 4.7, 5.2, 5.2],
      [32, 32, 42, 58, 70, 78, 84, 87, 85, 76, 52, 38],
    ),
  ),
  ZAE_4: profile(
    "ZAE_4",
    "Zone Ouest-Atacora",
    "UNIMODAL",
    months(
      [2, 6, 25, 70, 130, 160, 200, 260, 230, 100, 10, 2],
      [0, 1, 3, 7, 11, 13, 16, 19, 17, 10, 1, 0],
      [34, 36, 37, 36, 33, 31, 29, 28, 30, 32, 34, 34],
      [18, 21, 24, 24, 23, 22, 21, 21, 21, 21, 20, 18],
      [5.6, 6.3, 6.6, 6.2, 5.4, 4.6, 4.0, 3.8, 4.0, 4.6, 5.2, 5.3],
      [30, 30, 42, 60, 72, 80, 86, 88, 86, 76, 50, 36],
    ),
  ),
  // Zone de transition : le fléchissement d'août est trop faible pour parler de bimodalité,
  // le référentiel la classe UNIMODAL avec un pic en septembre.
  ZAE_5: profile(
    "ZAE_5",
    "Zone cotonnière du Centre-Bénin",
    "UNIMODAL",
    months(
      [8, 20, 50, 90, 140, 160, 140, 130, 200, 140, 25, 8],
      [1, 2, 5, 8, 11, 13, 12, 12, 15, 11, 3, 1],
      [34, 36, 36, 34, 32, 30, 29, 28, 30, 31, 33, 33],
      [21, 23, 24, 24, 23, 22, 22, 21, 21, 22, 22, 21],
      [5.2, 5.8, 6.0, 5.6, 5.0, 4.4, 4.0, 3.9, 4.1, 4.5, 4.9, 5.0],
      [42, 44, 55, 68, 76, 82, 85, 86, 85, 80, 62, 48],
    ),
  ),
  ZAE_6: profile(
    "ZAE_6",
    "Zone des terres de barre",
    "BIMODAL",
    months(
      [12, 35, 80, 130, 190, 230, 110, 45, 110, 150, 50, 15],
      [1, 3, 6, 9, 13, 15, 8, 5, 9, 12, 5, 2],
      [32, 33, 33, 32, 31, 29, 28, 28, 29, 30, 31, 32],
      [23, 24, 25, 25, 24, 23, 23, 23, 23, 23, 23, 23],
      [4.6, 5.0, 5.2, 5.0, 4.6, 4.0, 3.9, 4.0, 4.1, 4.3, 4.5, 4.5],
      [72, 74, 76, 78, 80, 84, 84, 83, 83, 82, 78, 74],
    ),
  ),
  ZAE_7: profile(
    "ZAE_7",
    "Zone de la dépression de la Lama",
    "BIMODAL",
    months(
      [10, 32, 80, 130, 190, 220, 105, 45, 110, 150, 50, 14],
      [1, 3, 6, 9, 13, 14, 8, 4, 9, 12, 5, 2],
      [33, 34, 34, 33, 31, 29, 28, 28, 29, 30, 32, 32],
      [22, 24, 25, 24, 24, 23, 22, 22, 22, 23, 23, 22],
      [4.8, 5.2, 5.4, 5.1, 4.7, 4.1, 3.9, 4.0, 4.1, 4.4, 4.6, 4.6],
      [62, 65, 70, 75, 78, 83, 84, 83, 83, 80, 72, 66],
    ),
  ),
  ZAE_8: profile(
    "ZAE_8",
    "Zone des pêcheries et du littoral",
    "BIMODAL",
    months(
      [15, 40, 80, 130, 200, 340, 120, 50, 100, 160, 60, 20],
      [2, 3, 6, 9, 13, 17, 9, 5, 9, 13, 6, 3],
      [31, 32, 32, 32, 31, 29, 28, 27, 28, 30, 31, 31],
      [24, 25, 25, 25, 24, 23, 23, 22, 23, 23, 24, 24],
      [4.4, 4.8, 5.0, 4.8, 4.4, 3.8, 3.8, 3.9, 4.0, 4.2, 4.4, 4.3],
      [78, 79, 80, 80, 82, 86, 86, 85, 84, 83, 81, 79],
    ),
  ),
};

export function getClimateProfile(zone: ZoneCode): ClimateProfile {
  return CLIMATE_PROFILES[zone];
}
