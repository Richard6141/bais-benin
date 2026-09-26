import {
  Popup,
  type ExpressionSpecification,
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";

// Couche « Feux actifs » (ADR-0022), partagée par la carte agricole et le centre de veille :
// cercles de taille et de couleur selon la puissance radiative (FRP), fenêtre d'information au
// clic, heure affichée à Porto-Novo. Les données viennent de /api/v1/fires (GeoJSON public).

export type FireWindowParam = "24h" | "7j";

/** Collection GeoJSON renvoyée par /api/v1/fires. */
export interface FireCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: string | number;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

export const FIRE_IDS = { source: "fires", layer: "fires-circles" } as const;
export const FIRE_ATTRIBUTION = "Feux actifs : NASA FIRMS (VIIRS 375 m, MODIS)";

/** Classes de puissance de la légende, en mégawatts. */
export const FIRE_CLASSES = [
  { label: "Faible, moins de 10 MW", max: 10, color: "#f2b705" },
  { label: "Moyen, de 10 à 50 MW", max: 50, color: "#e8590c" },
  { label: "Fort, plus de 50 MW", max: Number.POSITIVE_INFINITY, color: "#a61e1e" },
] as const;

export function fireDataUrl(window: FireWindowParam): string {
  return `/api/v1/fires?fenetre=${window}`;
}

const colorByPower: ExpressionSpecification = [
  "step",
  ["get", "frp"],
  FIRE_CLASSES[0].color,
  FIRE_CLASSES[0].max,
  FIRE_CLASSES[1].color,
  FIRE_CLASSES[1].max,
  FIRE_CLASSES[2].color,
];

const SENSOR_LABELS: Record<string, string> = {
  VIIRS_SNPP: "VIIRS Suomi NPP",
  VIIRS_NOAA20: "VIIRS NOAA-20",
  VIIRS_NOAA21: "VIIRS NOAA-21",
  MODIS: "MODIS",
};
const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: "faible",
  NOMINAL: "moyenne",
  HIGH: "haute",
};

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});

/** Contenu de la fenêtre d'information, en nœuds texte (aucun HTML venu des données). */
function popupContent(properties: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  root.className = "text-sm";
  const lines = [
    `Feu détecté le ${timeFormatter.format(new Date(String(properties.detectedAt)))}, heure de Porto-Novo`,
    `Commune : ${String(properties.commune ?? "")}`,
    `Capteurs : ${String(properties.sensors ?? "")
      .split(",")
      .map((code) => SENSOR_LABELS[code] ?? code)
      .join(", ")}`,
    `Confiance : ${CONFIDENCE_LABELS[String(properties.confidence)] ?? "inconnue"}`,
    `Puissance : ${Number(properties.frp ?? 0).toLocaleString("fr-FR")} MW`,
  ];
  lines.forEach((text, index) => {
    const line = document.createElement("p");
    line.textContent = text;
    if (index === 0) line.className = "font-medium";
    root.append(line);
  });
  return root;
}

// Les écouteurs restent attachés à l'identifiant de couche après son retrait : une seule
// inscription par carte, sinon chaque réaffichage ouvrirait une fenêtre de plus.
const withHandlers = new WeakSet<MapLibreMap>();

/** Ajoute (ou remplace) la couche des feux au-dessus des communes. */
export function showFireLayer(map: MapLibreMap, collection: FireCollection): void {
  const data = collection as unknown as GeoJSONSourceSpecification["data"];
  const source = map.getSource(FIRE_IDS.source) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
    return;
  }
  map.addSource(FIRE_IDS.source, { type: "geojson", data });
  map.addLayer({
    id: FIRE_IDS.layer,
    type: "circle",
    source: FIRE_IDS.source,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 6, 13, 10],
      "circle-color": colorByPower,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
      "circle-opacity": 0.9,
    },
  });
  if (withHandlers.has(map)) return;
  withHandlers.add(map);
  map.on("click", FIRE_IDS.layer, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(event.lngLat)
      .setDOMContent(popupContent(feature.properties ?? {}))
      .addTo(map);
  });
  map.on("mouseenter", FIRE_IDS.layer, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", FIRE_IDS.layer, () => (map.getCanvas().style.cursor = ""));
}

export function hideFireLayer(map: MapLibreMap): void {
  if (map.getLayer(FIRE_IDS.layer)) map.removeLayer(FIRE_IDS.layer);
  if (map.getSource(FIRE_IDS.source)) map.removeSource(FIRE_IDS.source);
}
