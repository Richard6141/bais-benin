import type { ImageryLayer } from "@/services/ports/remote-sensing-provider";
import { ndviScale } from "@/styles/tokens";

// Scripts d'évaluation (« evalscripts », version 3) exécutés par les API de traitement du
// Copernicus Data Space Ecosystem : le calcul se fait côté Copernicus, BAIS ne reçoit que
// l'image ou les statistiques. Aucun traitement raster local (ADR-0016).

// Classes SCL (Scene Classification) écartées du NDVI : absence de donnée, pixel saturé,
// ombre de nuage, nuages de probabilité moyenne et forte, cirrus, neige.
export const MASKED_SCL_CLASSES = [0, 1, 3, 8, 9, 10, 11] as const;

function hexToUnitRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Number((((value >> shift) & 0xff) / 255).toFixed(4));
  return [channel(16), channel(8), channel(0)];
}

// Couleur naturelle : bandes rouge, verte et bleue avec un gain de 2,5 (réflectances L2A
// sombres sinon). Les nuages restent visibles, c'est l'image réelle ; seule l'absence de
// donnée devient transparente.
const TRUE_COLOR = `//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4, sampleType: "AUTO" } };
}
function evaluatePixel(s) {
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, s.dataMask];
}`;

function ndviRenderScript(): string {
  const classes = ndviScale.map((entry) => ({
    max: entry.max,
    rgb: hexToUnitRgb(entry.color),
  }));
  return `//VERSION=3
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
const CLASSES = ${JSON.stringify(classes)};
function setup() {
  return { input: ["B04", "B08", "SCL", "dataMask"], output: { bands: 4, sampleType: "AUTO" } };
}
function evaluatePixel(s) {
  if (s.dataMask === 0 || MASKED.includes(s.SCL)) return [0, 0, 0, 0];
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  for (const c of CLASSES) {
    if (c.max === null || ndvi < c.max) return [c.rgb[0], c.rgb[1], c.rgb[2], 1];
  }
  return [0, 0, 0, 0];
}`;
}

/** Passages retenus pour la mosaïque sans nuages : chacun ajoute son coût en unités. */
export const CLOUD_FREE_PASSES = 3;

// Mosaïque sans nuages (mosaïque par orbite) : ne garde que les passages les moins nuageux, puis
// prend pour chaque pixel le plus récent de ces passages où il est dégagé (les échantillons
// arrivent du plus récent au plus ancien).
const CLEAR_PICK = `
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
const PASSES = ${CLOUD_FREE_PASSES};
function orbitCloud(orbit) {
  const tiles = orbit.tiles || [];
  if (tiles.length === 0) return 50;
  let sum = 0;
  for (let t = 0; t < tiles.length; t++) {
    sum += typeof tiles[t].cloudCoverage === "number" ? tiles[t].cloudCoverage : 50;
  }
  return sum / tiles.length;
}
function preProcessScenes(collections) {
  const orbits = collections.scenes.orbits;
  const kept = orbits.slice().sort(function (a, b) { return orbitCloud(a) - orbitCloud(b); })
    .slice(0, PASSES);
  collections.scenes.orbits = orbits.filter(function (orbit) { return kept.indexOf(orbit) >= 0; });
  return collections;
}
function clearSample(samples) {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.dataMask === 1 && MASKED.indexOf(s.SCL) < 0) return s;
  }
  return null;
}`;

// Couleur naturelle sans nuages ; un pixel couvert à chaque passage garde le plus récent, nuage
// compris, plutôt qu'un trou dans l'image.
const TRUE_COLOR_CLOUD_FREE = `//VERSION=3
${CLEAR_PICK}
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "AUTO" },
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  let s = clearSample(samples);
  if (!s) {
    for (let i = 0; i < samples.length && !s; i++) if (samples[i].dataMask === 1) s = samples[i];
  }
  if (!s) return [0, 0, 0, 0];
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, 1];
}`;

function ndviCloudFreeScript(): string {
  const classes = ndviScale.map((entry) => ({
    max: entry.max,
    rgb: hexToUnitRgb(entry.color),
  }));
  return `//VERSION=3
${CLEAR_PICK}
const CLASSES = ${JSON.stringify(classes)};
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "AUTO" },
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  const s = clearSample(samples);
  if (!s) return [0, 0, 0, 0];
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  for (const c of CLASSES) {
    if (c.max === null || ndvi < c.max) return [c.rgb[0], c.rgb[1], c.rgb[2], 1];
  }
  return [0, 0, 0, 0];
}`;
}

/** Script de rendu d'une couche d'image ; `cloudFree` : mosaïque sans nuages par pixel. */
export function renderEvalscript(layer: ImageryLayer, cloudFree = false): string {
  if (layer === "TRUE_COLOR") return cloudFree ? TRUE_COLOR_CLOUD_FREE : TRUE_COLOR;
  return cloudFree ? ndviCloudFreeScript() : ndviRenderScript();
}

/**
 * Variables de délimitation des champs : sur tous les passages de la période (mosaïque par
 * orbite), NDVI le plus haut et le plus bas, et réflectance B11 moyenne, nuages exclus. Codés
 * sur 8 bits (NDVI : (v + 1) × 127,5 ; B11 : × 255) ; le quatrième canal compte les passages
 * retenus, 0 là où rien n'a été vu.
 */
export const FIELD_FEATURES_EVALSCRIPT = `//VERSION=3
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" },
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  let peak = -1, low = 2, swir = 0, n = 0;
  for (const s of samples) {
    if (s.dataMask === 0 || MASKED.includes(s.SCL) || s.B08 + s.B04 <= 0) continue;
    const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
    if (ndvi > peak) peak = ndvi;
    if (ndvi < low) low = ndvi;
    swir += s.B11;
    n += 1;
  }
  if (n === 0) return [0, 0, 0, 0];
  return [
    Math.round((peak + 1) * 127.5),
    Math.round((low + 1) * 127.5),
    Math.round(Math.min(1, swir / n) * 255),
    Math.min(255, n)
  ];
}`;

/**
 * Script radar de l'API Statistical (Sentinel-1, ADR-0019) : indice de végétation radar
 * RVI = 4·VH / (VV + VH) en puissances linéaires, et rétrodiffusion VH en dB. Le radar voit à
 * travers les nuages : seuls les pixels sans donnée (bord de fauchée, ombre radar) sont écartés.
 */
export const RADAR_STATISTICS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: [
      { id: "rvi", bands: 1, sampleType: "FLOAT32" },
      { id: "vh", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && s.VV > 0 && s.VH > 0;
  return {
    rvi: [valid ? (4 * s.VH) / (s.VV + s.VH) : NaN],
    vh: [valid ? (10 * Math.log(s.VH)) / Math.LN10 : NaN],
    dataMask: [valid ? 1 : 0]
  };
}`;

/**
 * Script de l'API Statistical : NDVI en flottant et masque des pixels retenus. Les pixels
 * nuageux (SCL) sortent du calcul au lieu de tirer la moyenne vers le bas.
 */
export const NDVI_STATISTICS_EVALSCRIPT = `//VERSION=3
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && !MASKED.includes(s.SCL) && s.B08 + s.B04 > 0;
  const ndvi = valid ? (s.B08 - s.B04) / (s.B08 + s.B04) : NaN;
  return { ndvi: [ndvi], dataMask: [valid ? 1 : 0] };
}`;

/**
 * Série Sentinel-2 d'une parcelle pour le modèle de culture (ADR-0030) : NDVI (B04, B08) et NDMI
 * (B08, B11, humidité du couvert et submersion des rizières), nuages, ombres et neige écartés.
 * Moyenne sur le contour, une valeur par décade (API Statistical).
 */
export const PARCEL_S2_EVALSCRIPT = `//VERSION=3
const MASKED = ${JSON.stringify(MASKED_SCL_CLASSES)};
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && !MASKED.includes(s.SCL) && s.B08 + s.B04 > 0 && s.B08 + s.B11 > 0;
  return {
    ndvi: [valid ? (s.B08 - s.B04) / (s.B08 + s.B04) : NaN],
    ndmi: [valid ? (s.B08 - s.B11) / (s.B08 + s.B11) : NaN],
    dataMask: [valid ? 1 : 0]
  };
}`;

/**
 * Série Sentinel-1 d'une parcelle (ADR-0030) : rétrodiffusion VV et VH en décibels, moyenne sur le
 * contour. Le radar voit à travers les nuages de pleine saison.
 */
export const PARCEL_S1_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: [
      { id: "vv", bands: 1, sampleType: "FLOAT32" },
      { id: "vh", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && s.VV > 0 && s.VH > 0;
  return {
    vv: [valid ? (10 * Math.log(s.VV)) / Math.LN10 : NaN],
    vh: [valid ? (10 * Math.log(s.VH)) / Math.LN10 : NaN],
    dataMask: [valid ? 1 : 0]
  };
}`;
