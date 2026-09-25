import { brandColors, choroplethNoData, choroplethScale, reliabilityColors } from "@/styles/tokens";

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

export const TILE_URL_TEMPLATE = (layer: "communes" | "departements" | "farms") =>
  `/api/tiles/${layer}/{z}/{x}/{y}.pbf`;

export const SOURCE_IDS = {
  communes: "bais-communes",
  departements: "bais-departements",
  farms: "bais-farms",
} as const;

export const LAYER_IDS = {
  communeFill: "bais-commune-fill",
  communeLine: "bais-commune-line",
  communeHover: "bais-commune-hover",
  departementLine: "bais-departement-line",
  farmPoints: "bais-farm-points",
} as const;

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
