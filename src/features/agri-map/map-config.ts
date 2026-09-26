import type { ExpressionSpecification } from "maplibre-gl";
import {
  brandColors,
  choroplethNoData,
  choroplethScale,
  cropMapColors,
  ndviScale,
  reliabilityColors,
  semanticColors,
} from "@/styles/tokens";

// Réglages partagés de la carte agricole : emprise, fond, couches et couleurs.
// Le fond de carte est un style MapLibre servi par OpenFreeMap (données OpenStreetMap),
// remplaçable par un style auto-hébergé via NEXT_PUBLIC_MAP_STYLE_URL (ADR-0006).

export const BENIN_CENTER: [number, number] = [2.35, 9.3];
export const BENIN_BOUNDS: [[number, number], [number, number]] = [
  [0.6, 5.9],
  [4.0, 12.5],
];
export const INITIAL_ZOOM = 6.2;

export const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/positron";

export const TILE_URL_TEMPLATE = (layer: "communes" | "departements" | "farms" | "parcels") =>
  `/api/tiles/${layer}/{z}/{x}/{y}.pbf`;

export const SOURCE_IDS = {
  communes: "bais-communes",
  departements: "bais-departements",
  farms: "bais-farms",
  parcels: "bais-parcels",
} as const;

export const LAYER_IDS = {
  communeFill: "bais-commune-fill",
  communeLine: "bais-commune-line",
  communeHover: "bais-commune-hover",
  departementLine: "bais-departement-line",
  farmPoints: "bais-farm-points",
  parcelFill: "bais-parcel-fill",
  parcelLine: "bais-parcel-line",
} as const;

/** Les parcelles apparaissent à partir de ce zoom (tuiles servies dès 12). */
export const PARCEL_MIN_ZOOM = 12;

// Parcelles : remplies de la couleur de leur culture principale (gris si aucune n'est déclarée),
// bordées de latérite quand le satellite demande une visite, d'encre quand elles sont ouvertes.
export const PARCEL_COLORS = {
  noCrop: "#9aa3ad",
  outline: brandColors.paper,
  toVerify: semanticColors.warning,
  selected: brandColors.ink,
} as const;

// Vue du ciel (ADR-0016) : images Sentinel-2 calculées par Copernicus, servies par
// /api/satellite. Les valeurs doublent celles de modules/satellite (imagery.ts, periods.ts),
// que le navigateur ne charge pas : ce module-là parle à la base et à Copernicus.
export type SkyLayer = "couleur-naturelle" | "ndvi";

export interface SkyView {
  layer: SkyLayer;
  /** Mois AAAA-MM. */
  period: string;
}

export const SKY_LAYERS: Record<SkyLayer, { label: string }> = {
  "couleur-naturelle": { label: "Image satellite" },
  ndvi: { label: "Végétation (NDVI)" },
};

export const SATELLITE_BOUNDS: [number, number, number, number] = [0.6, 5.9, 4.0, 12.5];
export const SATELLITE_DETAIL_MIN_ZOOM = 9;
export const SATELLITE_DETAIL_MAX_ZOOM = 13;
export const SATELLITE_TILE_SIZE = 512;

export const SATELLITE_IDS = {
  overviewSource: "bais-sat-overview",
  overviewLayer: "bais-sat-overview-layer",
  detailSource: "bais-sat-detail",
  detailLayer: "bais-sat-detail-layer",
} as const;

export function satelliteImageUrl(view: SkyView, tile: "overview.png" | "{z}/{x}/{y}.png") {
  return `/api/satellite/${view.layer}/${view.period}/${tile}`;
}

/** Fenêtre glissante des 60 derniers jours (modules/satellite/periods.ts, ROLLING_PERIOD). */
export const ROLLING_SKY_PERIOD = "60-jours";

// Carte des cultures par satellite (ADR-0021) : classification phénologique des 12 derniers
// mois, calculée par Copernicus, en image d'ensemble du pays seulement (environ 380 m par pixel).
// Même fenêtre que modules/satellite (periods.ts, CROP_MAP_PERIOD).
export const CROP_MAP_LAYER = "cultures";
/** Fond de carte choisi : communes (null), vue du ciel, ou carte des cultures. */
export type BaseLayer = SkyLayer | typeof CROP_MAP_LAYER;
export const CROP_MAP_PERIOD = "12-mois";
export const CROP_MAP_URL = `/api/satellite/${CROP_MAP_LAYER}/${CROP_MAP_PERIOD}/overview.png`;

export const CROP_MAP_IDS = {
  source: "bais-crop-map",
  layer: "bais-crop-map-layer",
} as const;

/** Classes de la légende, cultures d'abord ; l'absence de classe reste transparente. */
export const CROP_MAP_CLASSES = [
  { key: "ANNUAL", label: "Maïs et cultures annuelles", color: cropMapColors.ANNUAL },
  { key: "COTTON", label: "Coton", color: cropMapColors.COTTON },
  { key: "RICE", label: "Riz", color: cropMapColors.RICE },
  { key: "PERENNIAL", label: "Cultures pérennes", color: cropMapColors.PERENNIAL },
  { key: "GARDEN", label: "Maraîchage", color: cropMapColors.GARDEN },
  { key: "FALLOW", label: "Jachère et sol nu", color: cropMapColors.FALLOW },
  { key: "NATURAL", label: "Forêt et savane", color: cropMapColors.NATURAL },
  { key: "WATER", label: "Eau", color: cropMapColors.WATER },
  { key: "BUILT", label: "Bâti", color: cropMapColors.BUILT },
] as const;

/** Mention Copernicus de la carte des cultures : sa série couvre deux années civiles. */
export function cropMapAttribution(now = new Date()): string {
  const year = now.getFullYear();
  return `Contains modified Copernicus Sentinel data ${year - 1}-${year}`;
}

/** Mention exigée par la licence Copernicus pour toute image dérivée. */
export function copernicusAttribution(period: string, now = new Date()): string {
  const year = period === ROLLING_SKY_PERIOD ? String(now.getFullYear()) : period.slice(0, 4);
  return `Contains modified Copernicus Sentinel data ${year}`;
}

/**
 * Opacité des communes : pleine sur la carte, nulle sur l'image (survol et clic restent actifs).
 * En se rapprochant des champs, la couleur s'efface pour laisser lire le fond (routes, villages)
 * et les parcelles.
 */
export const COMMUNE_FILL_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  ["case", ["boolean", ["feature-state", "selected"], false], 0.9, 0.78],
  12.5,
  ["case", ["boolean", ["feature-state", "selected"], false], 0.22, 0.12],
];

export type MetricKey = "farmCount" | "declaredAreaHa" | "verifiedShare";

export const METRICS: Record<
  MetricKey,
  { label: string; unit: string; format: (value: number) => string }
> = {
  farmCount: {
    label: "Exploitations",
    unit: "",
    format: (value) => new Intl.NumberFormat("fr-FR").format(value),
  },
  declaredAreaHa: {
    label: "Superficie déclarée",
    unit: "ha",
    format: (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value),
  },
  verifiedShare: {
    label: "Part vérifiée",
    unit: "",
    format: (value) =>
      new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(value),
  },
};

export const CHOROPLETH_SCALE = choroplethScale;
export const NDVI_SCALE = ndviScale;
export const NO_DATA_COLOR = choroplethNoData;
export const OUTLINE_COLOR = brandColors.ink;
export const FARM_COLORS = {
  DECLARED: reliabilityColors.DECLARED,
  AGENT_VERIFIED: reliabilityColors.AGENT_VERIFIED,
  FIELD_VERIFIED: reliabilityColors.FIELD_VERIFIED,
  DISPUTED: reliabilityColors.ESTIMATED,
} as const;

// Seuils de classes calculés sur les valeurs présentes : les quantiles évitent qu'une
// commune très peuplée écrase toutes les autres dans la première classe.
// B3 : les communes masquées (secret statistique, k=5) portent une valeur nulle pour la
// métrique — elles sont ignorées ici (Number.isFinite(null) est faux) et retombent, dans
// classIndex, sur la classe « sans donnée » de la carte, au même titre qu'une commune sans
// exploitation. On ne peut pas déduire leur rang depuis la couleur affichée.
export function quantileBreaks(
  values: (number | null)[],
  classes = CHOROPLETH_SCALE.length,
): number[] {
  const sorted = values
    .filter((v): v is number => Number.isFinite(v) && (v as number) > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let index = 1; index < classes; index += 1) {
    const position = Math.floor((index / classes) * (sorted.length - 1));
    const value = sorted[position] ?? sorted[sorted.length - 1] ?? 0;
    if (breaks[breaks.length - 1] !== value) breaks.push(value);
  }
  return breaks;
}

export function classIndex(value: number | null, breaks: number[]): number {
  if (value === null || !(value > 0)) return -1;
  let index = 0;
  for (const limit of breaks) {
    if (value > limit) index += 1;
  }
  return Math.min(index, CHOROPLETH_SCALE.length - 1);
}
