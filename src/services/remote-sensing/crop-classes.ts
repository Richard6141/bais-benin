import { MASKED_SCL_CLASSES } from "./evalscripts";

// Carte des cultures par satellite (ADR-0021) : classification phénologique par pixel, exécutée
// chez Copernicus. Le script reçoit toute la série des 12 derniers mois du pixel (mosaïque par
// orbite) ; preProcessScenes n'en garde qu'un passage par mois, le moins nuageux, ce qui borne
// les unités de traitement à une douzaine d'échantillons. Une seule règle sert à l'image de la
// carte et aux surfaces par commune.

/** Codes des classes, communs au script, à la base et à l'interface. 0 : non classé. */
export const CROP_CLASS_CODES = {
  UNCLASSIFIED: 0,
  RICE: 1,
  ANNUAL: 2,
  COTTON: 3,
  PERENNIAL: 4,
  GARDEN: 5,
  FALLOW: 6,
  NATURAL: 7,
  WATER: 8,
  BUILT: 9,
} as const;

export type CropClass = keyof typeof CROP_CLASS_CODES;
export const CROP_CLASSES = Object.keys(CROP_CLASS_CODES) as CropClass[];

function hexToUnitRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Number((((value >> shift) & 0xff) / 255).toFixed(4));
  return [channel(16), channel(8), channel(0)];
}

// Règle de classification, en JavaScript de l'evalscript (ES5 : pas de module, pas d'import).
// OFFSET abaisse les seuils de végétation dans les zones les plus sèches (ZAE 1 et 2).
// Quatre bandes seulement (ADR-0023) : chaque bande lue coûte un tiers d'unité de plus. L'eau se
// lit dans la classe SCL 6 et la submersion des rizières dans l'indice LSWI (B08, B11).
const CLASSIFY = `
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
function median(values) {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function orbitCloud(orbit) {
  const tiles = orbit.tiles || [];
  if (tiles.length === 0) return 50;
  let sum = 0;
  for (let t = 0; t < tiles.length; t++) {
    sum += typeof tiles[t].cloudCoverage === "number" ? tiles[t].cloudCoverage : 50;
  }
  return sum / tiles.length;
}
// Un passage par mois et par trace Sentinel-2, le moins nuageux, sur les douze derniers mois.
// Une même trace est survolée tous les cinq jours : le jour modulo 5 la désigne. Un seul passage
// par mois ne couvrirait qu'une trace, et une zone à cheval sur deux perdrait la moitié de ses
// mois. Chaque passage retenu est facturé (365 jours touchent treize mois calendaires).
function preProcessScenes(collections) {
  const best = {};
  const seen = {};
  const orbits = collections.scenes.orbits;
  for (let i = 0; i < orbits.length; i++) {
    const orbit = orbits[i];
    const month = orbit.dateFrom.slice(0, 7);
    const track = Math.floor(Date.parse(orbit.dateFrom) / 86400000) % 5;
    const key = month + "|" + track;
    const cloud = orbitCloud(orbit);
    seen[month] = true;
    if (!best[key] || cloud < best[key].cloud) {
      best[key] = { orbit: orbit, cloud: cloud, month: month };
    }
  }
  const months = Object.keys(seen).sort().slice(-12);
  const chosen = [];
  for (const key in best) {
    if (months.indexOf(best[key].month) !== -1) chosen.push(best[key]);
  }
  // Par mois, le passage le moins nuageux d'abord : c'est lui que lit la règle quand un pixel
  // est vu par deux traces.
  chosen.sort(function (a, b) {
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    return a.cloud - b.cloud;
  });
  collections.scenes.orbits = chosen.map(function (entry) { return entry.orbit; });
  return collections;
}
function classify(samples, scenes) {
  const ndvi = {};
  const flood = {};
  const built = [];
  let valid = 0;
  let waterSeen = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.dataMask === 0 || MASKED.indexOf(s.SCL) !== -1) continue;
    if (s.B08 + s.B04 <= 0 || s.B11 + s.B08 <= 0) continue;
    const month = new Date(scenes.orbits[i].dateFrom).getUTCMonth() + 1;
    // Déjà vu ce mois-ci par un passage moins nuageux (autre trace).
    if (ndvi[month] !== undefined) continue;
    const v = (s.B08 - s.B04) / (s.B08 + s.B04);
    // LSWI : l'eau sous le couvert abaisse le proche infrarouge moins que l'infrarouge moyen.
    const lswi = (s.B08 - s.B11) / (s.B08 + s.B11);
    ndvi[month] = v;
    flood[month] = s.SCL === 6 || lswi + 0.05 >= v;
    built.push((s.B11 - s.B08) / (s.B11 + s.B08));
    if (s.SCL === 6) waterSeen++;
    valid++;
  }
  if (valid < 4) return 0;
  const months = Object.keys(ndvi).map(Number);
  let max = -1;
  let maxMonth = 0;
  let min = 2;
  let green = 0;
  const dryValues = [];
  const rainyValues = [];
  for (let k = 0; k < months.length; k++) {
    const m = months[k];
    const v = ndvi[m];
    if (v > max) { max = v; maxMonth = m; }
    if (v < min) min = v;
    if (v >= 0.5 - OFFSET) green++;
    if (m === 12 || m <= 3) dryValues.push(v);
    if (m >= 5 && m <= 10) rainyValues.push(v);
  }
  const dry = dryValues.length > 0 ? median(dryValues) : min;
  const rainy = rainyValues.length > 0 ? median(rainyValues) : max;
  const amplitude = max - min;
  const late = Math.max(ndvi[10] === undefined ? -1 : ndvi[10], ndvi[11] === undefined ? -1 : ndvi[11]);
  const june = ndvi[6] === undefined ? (ndvi[7] === undefined ? -1 : ndvi[7]) : ndvi[6];
  // Montée rapide : un champ passe du sol nu au couvert vert en deux mois, une savane reverdit
  // progressivement dès les premières pluies. Premier mois vert d'avril à novembre, comparé au
  // NDVI deux mois plus tôt (trois à défaut).
  let onset = 0;
  for (let m = 4; m <= 11 && onset === 0; m++) {
    if (ndvi[m] !== undefined && ndvi[m] >= 0.5 - OFFSET) onset = m;
  }
  const before = onset === 0 ? undefined
    : ndvi[onset - 2] !== undefined ? ndvi[onset - 2] : ndvi[onset - 3];
  const steep = before !== undefined && before <= 0.35 && ndvi[onset] - before >= 0.25 - OFFSET;
  // Riz : submersion en début de cycle puis couvert dense dans les trois mois.
  let flooded = false;
  for (let m = 5; m <= 10 && !flooded; m++) {
    if (flood[m] === true && ndvi[m] <= 0.35) {
      for (let d = 1; d <= 3; d++) {
        if (ndvi[m + d] !== undefined && ndvi[m + d] >= 0.5 - OFFSET) { flooded = true; break; }
      }
    }
  }
  if (waterSeen >= valid / 2 && max < 0.4) return 8;
  if (median(built) > 0.05 && max < 0.3) return 9;
  if (max < 0.35 - OFFSET) return 6;
  if (flooded) return 1;
  if (dry >= 0.6 - OFFSET) return 7;
  if (dry >= 0.45 - OFFSET && amplitude <= 0.25) return 4;
  if ((maxMonth === 12 || maxMonth <= 3) && max >= 0.45 - OFFSET && rainy < 0.4) return 5;
  // Culture annuelle : sol nu en saison sèche, forte amplitude, montée rapide, saison verte
  // courte. Sans l'un de ces signes, le pixel n'est pas compté comme cultivé.
  if (dry <= 0.35 && amplitude >= 0.3 - OFFSET && steep && green >= 1 && green <= 4) {
    if ((maxMonth === 9 || maxMonth === 10) && late >= 0.45 - OFFSET && june < 0.35) return 3;
    return 2;
  }
  if (green >= 5 || dry > 0.35) return 7;
  // Savane : saison verte nette mais sans la montée rapide d'un champ semé.
  if (amplitude >= 0.25 && max >= 0.5 - OFFSET) return 7;
  return 6;
}`;

const INPUT = `input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }]`;

/**
 * Source de la règle seule, avec son décalage : les tests l'évaluent dans Node sur des séries de
 * pixels synthétiques, pour vérifier chaque classe sans appeler Copernicus.
 */
export function cropClassifierSource(zoneOffset = 0): string {
  return `const OFFSET = ${Number(zoneOffset.toFixed(3))};\n${CLASSIFY}`;
}

/** Couleurs des classes, dans l'ordre des codes (0 : transparent). */
export function cropClassRenderEvalscript(colors: Record<CropClass, string>): string {
  const palette = CROP_CLASSES.map((code) =>
    code === "UNCLASSIFIED" ? null : hexToUnitRgb(colors[code]),
  );
  return `//VERSION=3
const OFFSET = 0;
const PALETTE = ${JSON.stringify(palette)};
${CLASSIFY}
function setup() {
  return { ${INPUT}, output: { bands: 4, sampleType: "AUTO" }, mosaicking: "ORBIT" };
}
function evaluatePixel(samples, scenes) {
  const code = classify(samples, scenes);
  const rgb = PALETTE[code];
  return rgb ? [rgb[0], rgb[1], rgb[2], 1] : [0, 0, 0, 0];
}`;
}

/** Histogramme des classes sur une commune (API Statistical), seuils décalés par zone. */
export function cropClassStatisticsEvalscript(zoneOffset: number): string {
  return `//VERSION=3
const OFFSET = ${Number(zoneOffset.toFixed(3))};
${CLASSIFY}
function setup() {
  return {
    ${INPUT},
    output: [
      { id: "crop", bands: 1, sampleType: "UINT8" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT"
  };
}
// Hors du contour de la commune, tous les échantillons ont dataMask 0 : ces pixels du rectangle
// englobant ne comptent pas, sinon ils passeraient pour « non classés ».
function evaluatePixel(samples, scenes) {
  let inside = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].dataMask === 1) { inside = 1; break; }
  }
  return { crop: [classify(samples, scenes)], dataMask: [inside] };
}`;
}
