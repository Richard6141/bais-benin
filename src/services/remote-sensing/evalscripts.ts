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

/** Script de rendu d'une couche d'image. */
export function renderEvalscript(layer: ImageryLayer): string {
  return layer === "TRUE_COLOR" ? TRUE_COLOR : ndviRenderScript();
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
