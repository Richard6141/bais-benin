"use client";

import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

// Le worker de MapLibre est servi en fichiers statiques (scripts/copy-maplibre-worker.mjs) :
// le bundler de Next ne sait pas exposer celui embarqué par la bibliothèque.
setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
import type { CommuneStats } from "@/modules/analytics";
import {
  BENIN_BOUNDS,
  BENIN_CENTER,
  CHOROPLETH_SCALE,
  FARM_COLORS,
  INITIAL_ZOOM,
  LAYER_IDS,
  MAP_STYLE_URL,
  OUTLINE_COLOR,
  SOURCE_IDS,
  TILE_URL_TEMPLATE,
  classIndex,
  quantileBreaks,
  type MetricKey,
} from "./map-config";

export interface HoveredCommune {
  code: string;
  name: string;
  departementCode: string;
  point: { x: number; y: number };
}

interface MapCanvasProps {
  statsByCode: Map<string, CommuneStats>;
  metric: MetricKey;
  showFarms: boolean;
  selectedCommuneCode: string | null;
  onSelectCommune: (code: string | null) => void;
  onHoverCommune: (hovered: HoveredCommune | null) => void;
  onReady?: () => void;
}

// Carte MapLibre : fond OpenStreetMap, communes en choroplèthe alimentée par les agrégats,
// contours des départements, points d'exploitations à partir du zoom 9. La couleur d'une
// commune vient d'un feature-state posé depuis les statistiques : la tuile reste stable
// et mise en cache, seules les valeurs changent avec les filtres.
export function MapCanvas({
  statsByCode,
  metric,
  showFarms,
  selectedCommuneCode,
  onSelectCommune,
  onHoverCommune,
  onReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoveredRef = useRef<string | null>(null);
  // Passe à vrai quand les sources et couches existent : les effets de peinture attendent ce signal.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: BENIN_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 5,
      maxZoom: 16,
      maxBounds: [
        [BENIN_BOUNDS[0][0] - 3, BENIN_BOUNDS[0][1] - 3],
        [BENIN_BOUNDS[1][0] + 3, BENIN_BOUNDS[1][1] + 3],
      ],
      attributionControl: false,
      cooperativeGestures: false,
    });
    // Cadrage sur le pays entier, avec une marge pour la légende et les commandes.
    map.fitBounds(BENIN_BOUNDS, {
      padding: { top: 24, right: 24, bottom: 24, left: 140 },
      duration: 0,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: "Limites administratives : geoBoundaries (CC BY 4.0)",
      }),
      "bottom-right",
    );
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SOURCE_IDS.departements, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("departements")}`],
        minzoom: 4,
        maxzoom: 12,
        promoteId: "code",
      });
      map.addSource(SOURCE_IDS.communes, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("communes")}`],
        minzoom: 4,
        maxzoom: 12,
        promoteId: "code",
      });
      map.addSource(SOURCE_IDS.farms, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("farms")}`],
        minzoom: 8,
        maxzoom: 14,
        promoteId: "code",
      });

      map.addLayer({
        id: LAYER_IDS.communeFill,
        type: "fill",
        source: SOURCE_IDS.communes,
        "source-layer": "communes",
        paint: {
          "fill-color": fillExpression(),
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.85, 0.65],
        },
      });
      map.addLayer({
        id: LAYER_IDS.communeLine,
        type: "line",
        source: SOURCE_IDS.communes,
        "source-layer": "communes",
        paint: { "line-color": OUTLINE_COLOR, "line-opacity": 0.25, "line-width": 0.6 },
      });
      map.addLayer({
        id: LAYER_IDS.communeHover,
        type: "line",
        source: SOURCE_IDS.communes,
        "source-layer": "communes",
        paint: {
          "line-color": OUTLINE_COLOR,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.5,
            ["boolean", ["feature-state", "hover"], false],
            1.8,
            0,
          ],
        },
      });
      map.addLayer({
        id: LAYER_IDS.departementLine,
        type: "line",
        source: SOURCE_IDS.departements,
        "source-layer": "departements",
        paint: { "line-color": OUTLINE_COLOR, "line-width": 1.4, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: LAYER_IDS.farmPoints,
        type: "circle",
        source: SOURCE_IDS.farms,
        "source-layer": "farms",
        minzoom: 9,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 5],
          "circle-color": [
            "match",
            ["get", "verification_status"],
            "FIELD_VERIFIED",
            FARM_COLORS.FIELD_VERIFIED,
            "AGENT_VERIFIED",
            FARM_COLORS.AGENT_VERIFIED,
            "DISPUTED",
            FARM_COLORS.DISPUTED,
            FARM_COLORS.DECLARED,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.6,
          "circle-opacity": 0.9,
        },
      });

      map.on("mousemove", LAYER_IDS.communeFill, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const code = typeof feature?.id === "string" ? feature.id : null;
        if (hoveredRef.current && hoveredRef.current !== code) {
          map.setFeatureState(
            { source: SOURCE_IDS.communes, sourceLayer: "communes", id: hoveredRef.current },
            { hover: false },
          );
        }
        if (code) {
          map.setFeatureState(
            { source: SOURCE_IDS.communes, sourceLayer: "communes", id: code },
            { hover: true },
          );
          map.getCanvas().style.cursor = "pointer";
          onHoverCommune({
            code,
            name: String(feature?.properties?.name ?? ""),
            departementCode: String(feature?.properties?.departement_code ?? ""),
            point: { x: event.point.x, y: event.point.y },
          });
        }
        hoveredRef.current = code;
      });
      map.on("mouseleave", LAYER_IDS.communeFill, () => {
        if (hoveredRef.current) {
          map.setFeatureState(
            { source: SOURCE_IDS.communes, sourceLayer: "communes", id: hoveredRef.current },
            { hover: false },
          );
        }
        hoveredRef.current = null;
        map.getCanvas().style.cursor = "";
        onHoverCommune(null);
      });
      map.on("click", LAYER_IDS.communeFill, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const code = typeof feature?.id === "string" ? feature.id : null;
        onSelectCommune(code);
      });

      setReady(true);
      onReady?.();
    });

    // Signal d'inactivité exposé au DOM : les tests et les captures attendent une carte peinte.
    map.on("idle", () => {
      containerRef.current?.setAttribute("data-map-idle", "true");
    });
    map.on("dataloading", () => {
      containerRef.current?.removeAttribute("data-map-idle");
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // La carte n'est construite qu'une fois ; les mises à jour passent par les effets suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Peinture : classes calculées sur la métrique courante, appliquées par feature-state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const values = [...statsByCode.values()].map((item) => item[metric]);
    const breaks = quantileBreaks(values);
    const applied = new Set<string>();
    for (const [code, item] of statsByCode) {
      map.setFeatureState(
        { source: SOURCE_IDS.communes, sourceLayer: "communes", id: code },
        { classIndex: classIndex(item[metric], breaks), value: item[metric] },
      );
      applied.add(code);
    }
    // Communes absentes du résultat (filtre sans exploitation) : classe hors échelle.
    map.removeFeatureState({ source: SOURCE_IDS.communes, sourceLayer: "communes" }, "classIndex");
    for (const code of applied) {
      const item = statsByCode.get(code);
      if (item) {
        map.setFeatureState(
          { source: SOURCE_IDS.communes, sourceLayer: "communes", id: code },
          { classIndex: classIndex(item[metric], breaks) },
        );
      }
    }
  }, [statsByCode, metric, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty(LAYER_IDS.farmPoints, "visibility", showFarms ? "visible" : "none");
  }, [showFarms, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.removeFeatureState({ source: SOURCE_IDS.communes, sourceLayer: "communes" }, "selected");
    if (selectedCommuneCode) {
      map.setFeatureState(
        { source: SOURCE_IDS.communes, sourceLayer: "communes", id: selectedCommuneCode },
        { selected: true },
      );
    }
  }, [selectedCommuneCode, ready]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="application"
      aria-label="Carte agricole du Bénin"
    />
  );
}

function fillExpression(): ExpressionSpecification {
  const stops: (string | number)[] = [];
  CHOROPLETH_SCALE.forEach((color, index) => {
    stops.push(index, color);
  });
  return [
    "case",
    ["==", ["coalesce", ["feature-state", "classIndex"], -1], -1],
    "#f1ede6",
    [
      "match",
      ["feature-state", "classIndex"],
      ...stops,
      "#f1ede6",
    ] as unknown as ExpressionSpecification,
  ] as ExpressionSpecification;
}
