"use client";

import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/feedback/map-unavailable";
import { hasWebGL2 } from "@/lib/webgl";
import {
  BENIN_BOUNDS,
  BENIN_CENTER,
  INITIAL_ZOOM,
  MAP_STYLE_URL,
  OUTLINE_COLOR,
  TILE_URL_TEMPLATE,
} from "@/features/agri-map/map-config";
import {
  FIRE_ATTRIBUTION,
  hideFireLayer,
  showFireLayer,
  type FireCollection,
} from "@/features/agri-map/fire-layer";
import { showLivePulses } from "@/features/live/live-pulse";
import type { LiveActivityItem } from "@/modules/live";
import { SEVERITY_COLORS } from "./alert-map-colors";
import type { Severity } from "./monitoring-logic";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const SOURCE = "alert-communes";
const FILL = "alert-commune-fill";

// La couleur vient d'un feature-state posé depuis les niveaux d'alerte : les tuiles communales
// de l'étape 4 sont réutilisées telles quelles, en cache, seules les valeurs changent.
function fillColor(): ExpressionSpecification {
  return [
    "match",
    ["coalesce", ["feature-state", "severity"], "NONE"],
    "CRITICAL",
    SEVERITY_COLORS.CRITICAL,
    "WARNING",
    SEVERITY_COLORS.WARNING,
    "WATCH",
    SEVERITY_COLORS.WATCH,
    "INFO",
    SEVERITY_COLORS.INFO,
    "#f1ede6",
  ] as ExpressionSpecification;
}

interface AlertMapCanvasProps {
  levels: readonly { communeCode: string; severity: Severity }[];
  /** Carte avec la couche des feux (centre de veille, ADR-0022) : mention NASA FIRMS. */
  withFires?: boolean;
  /** Feux actifs au-dessus des communes. */
  fires?: FireCollection | null;
  /** Faits arrivés en direct : un point pulse à leur position, puis s'efface. */
  pulses?: readonly LiveActivityItem[];
}

export function AlertMapCanvas({
  levels,
  withFires = false,
  fires = null,
  pulses = [],
}: AlertMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // WebGL2 absent : avis à la place de la carte, sans créer MapLibre (qui planterait).
  const [supported] = useState(hasWebGL2);
  const [ready, setReady] = useState(false);
  const shownPulses = useRef(new Set<string>());
  const router = useRouter();

  useEffect(() => {
    if (!supported || !containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: BENIN_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 5,
      maxZoom: 11,
      attributionControl: false,
    });
    map.fitBounds(BENIN_BOUNDS, { padding: 16, duration: 0 });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: withFires
          ? ["geoBoundaries (CC BY 4.0)", FIRE_ATTRIBUTION]
          : "geoBoundaries (CC BY 4.0)",
      }),
      "bottom-right",
    );
    mapRef.current = map;
    map.on("load", () => {
      map.addSource(SOURCE, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("communes")}`],
        minzoom: 4,
        maxzoom: 12,
        promoteId: "code",
      });
      map.addLayer({
        id: FILL,
        type: "fill",
        source: SOURCE,
        "source-layer": "communes",
        paint: { "fill-color": fillColor(), "fill-opacity": 0.75 },
      });
      map.addLayer({
        id: "alert-commune-line",
        type: "line",
        source: SOURCE,
        "source-layer": "communes",
        paint: { "line-color": OUTLINE_COLOR, "line-opacity": 0.3, "line-width": 0.6 },
      });
      map.on("click", FILL, (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.id;
        if (typeof code === "string") router.push(`/pilotage/alertes?commune=${code}#liste`);
      });
      map.on("mouseenter", FILL, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", FILL, () => (map.getCanvas().style.cursor = ""));
      setReady(true);
    });
    map.on("idle", () => containerRef.current?.setAttribute("data-map-idle", "true"));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Carte construite une fois ; les niveaux sont appliqués par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.removeFeatureState({ source: SOURCE, sourceLayer: "communes" });
    for (const level of levels) {
      map.setFeatureState(
        { source: SOURCE, sourceLayer: "communes", id: level.communeCode },
        { severity: level.severity },
      );
    }
  }, [levels, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (fires) showFireLayer(map, fires);
    else hideFireLayer(map);
  }, [fires, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    showLivePulses(map, pulses, shownPulses.current);
  }, [pulses, ready]);

  if (!supported) return <MapUnavailable />;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Carte des communes en alerte"
      className="h-full w-full"
    />
  );
}
