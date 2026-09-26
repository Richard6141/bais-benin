// Riz par radar Sentinel-1 (ADR-0026) : une rizière est inondée au repiquage, ce qui rend la
// rétrodiffusion VH très faible (eau lisse), puis le couvert monte et VH remonte de plusieurs
// décibels en un ou deux mois. Le radar voit à travers les nuages de pleine saison, quand
// Sentinel-2 ne voit plus les rizières de bas-fond.

/** VH d'une surface en eau ou presque : sous ce seuil, le pixel est submergé. */
export const RICE_WET_DB = -19;
/** Montée minimale de VH après la submersion : le riz a poussé. */
export const RICE_RISE_DB = 4;
/** VH d'un couvert de riz établi. */
export const RICE_CANOPY_DB = -17;
/** Sous ce seuil presque tous les mois, c'est un plan d'eau permanent, pas une rizière. */
const PERMANENT_WATER_DB = -20;

// Règle, en JavaScript de l'evalscript. Un passage par mois et par trace, de mai à novembre :
// une même trace Sentinel-1 est survolée tous les six jours (jour modulo 6), et chaque passage
// retenu est facturé. VH seul : une bande lue, un tiers d'unité.
const RULE = `
function preProcessScenes(collections) {
  const best = {};
  const orbits = collections.scenes.orbits;
  for (let i = 0; i < orbits.length; i++) {
    const orbit = orbits[i];
    const month = Number(orbit.dateFrom.slice(5, 7));
    if (month < 5 || month > 11) continue;
    const track = Math.floor(Date.parse(orbit.dateFrom) / 86400000) % 6;
    const key = orbit.dateFrom.slice(0, 7) + "|" + track;
    if (!best[key]) best[key] = orbit;
  }
  collections.scenes.orbits = Object.keys(best).sort().map(function (key) { return best[key]; });
  return collections;
}
function riceFlag(samples, scenes) {
  const vh = {};
  let observed = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.dataMask !== 1 || !(s.VH > 0)) continue;
    const month = new Date(scenes.orbits[i].dateFrom).getUTCMonth() + 1;
    if (vh[month] !== undefined) continue;
    vh[month] = (10 * Math.log(s.VH)) / Math.LN10;
    observed++;
  }
  if (observed < 4) return 0;
  let water = 0;
  for (const key in vh) if (vh[key] <= ${PERMANENT_WATER_DB}) water++;
  if (water >= observed - 1) return 0;
  for (let m = 5; m <= 9; m++) {
    if (vh[m] === undefined || vh[m] > ${RICE_WET_DB}) continue;
    for (let d = 1; d <= 2; d++) {
      const later = vh[m + d];
      if (later !== undefined && later >= ${RICE_CANOPY_DB} && later - vh[m] >= ${RICE_RISE_DB}) {
        return 1;
      }
    }
  }
  return 0;
}`;

/** Source de la règle seule : les tests l'évaluent dans Node sur des séries synthétiques. */
export function riceRadarSource(): string {
  return RULE;
}

/** Histogramme riz / pas riz sur une commune (API Statistical), pixels hors contour écartés. */
export const RICE_RADAR_STATISTICS_EVALSCRIPT = `//VERSION=3
${RULE}
function setup() {
  return {
    input: [{ bands: ["VH", "dataMask"] }],
    output: [
      { id: "rice", bands: 1, sampleType: "UINT8" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples, scenes) {
  let inside = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].dataMask === 1) { inside = 1; break; }
  }
  return { rice: [riceFlag(samples, scenes)], dataMask: [inside] };
}`;
