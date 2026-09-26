"use client";

import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/feedback/map-unavailable";
import {
  MAP_STYLE_URL,
  ROLLING_SKY_PERIOD,
  SATELLITE_BOUNDS,
  SATELLITE_DETAIL_MAX_ZOOM,
  SATELLITE_DETAIL_MIN_ZOOM,
  SATELLITE_TILE_SIZE,
  copernicusAttribution,
  satelliteImageUrl,
} from "@/features/agri-map/map-config";
import { hasWebGL2 } from "@/lib/webgl";
import type { CandidateLevel, ProposedContour } from "@/modules/satellite";
import { LEVEL_COLORS } from "./satellite-contour-logic";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

interface SatelliteContourMapProps {
  center: { lng: number; lat: number };
  point: { lng: number; lat: number } | null;
  candidates: readonly ProposedContour[];
  selected: CandidateLevel | null;
  /** Anneau du candidat choisi, tel que corrigé : ses sommets se déplacent au doigt. */
  ring: [number, number][] | null;
  onPoint: (point: { lng: number; lat: number }) => void;
  onMoveVertex: (index: number, to: [number, number]) => void;
}

const SOURCE = "bais-field-candidates";
const EDIT_SOURCE = "bais-field-edit";

// Carte de l'écran « Depuis le satellite » : image Sentinel-2 des 60 derniers jours (tuiles de
// la vue du ciel), point désigné, candidats en couleur, et sommets déplaçables du contour choisi.
export function SatelliteContourMap({
  center,
  point,
  candidates,
  selected,
  ring,
  onPoint,
  onMoveVertex,
}: SatelliteContourMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointMarker = useRef<Marker | null>(null);
  const vertexMarkers = useRef<Marker[]>([]);
  const [supported] = useState(hasWebGL2);
  const [ready, setReady] = useState(false);
  const onPointRef = useRef(onPoint);
  const onMoveRef = useRef(onMoveVertex);
  useEffect(() => {
    onPointRef.current = onPoint;
    onMoveRef.current = onMoveVertex;
  }, [onPoint, onMoveVertex]);

  useEffect(() => {
    if (!supported || !containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 15,
      maxZoom: 17,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: copernicusAttribution(ROLLING_SKY_PERIOD),
      }),
      "bottom-right",
    );
    mapRef.current = map;
    map.on("load", () => {
      const view = { layer: "couleur-naturelle" as const, period: ROLLING_SKY_PERIOD };
      map.addSource("bais-sat", {
        type: "raster",
        tiles: [`${window.location.origin}${satelliteImageUrl(view, "{z}/{x}/{y}.png")}`],
        tileSize: SATELLITE_TILE_SIZE,
        minzoom: SATELLITE_DETAIL_MIN_ZOOM,
        maxzoom: SATELLITE_DETAIL_MAX_ZOOM,
        bounds: SATELLITE_BOUNDS,
      });
      map.addLayer({ id: "bais-sat", type: "raster", source: "bais-sat" });
      map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(EDIT_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "bais-field-candidates",
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "selected"], 1.5, 2.5],
          "line-dasharray": [2, 1.5],
        },
      });
      map.addLayer({
        id: "bais-field-edit-fill",
        type: "fill",
        source: EDIT_SOURCE,
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "bais-field-edit-line",
        type: "line",
        source: EDIT_SOURCE,
        paint: { "line-color": "#ffffff", "line-width": 3 },
      });
      map.on("click", (event: MapMouseEvent) => {
        onPointRef.current({ lng: event.lngLat.lng, lat: event.lngLat.lat });
      });
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // La carte n'est construite qu'une fois ; le reste passe par les effets suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Point désigné par l'agent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    pointMarker.current?.remove();
    pointMarker.current = point ? new Marker().setLngLat([point.lng, point.lat]).addTo(map) : null;
  }, [point, ready]);

  // Candidats : pointillés colorés, le choisi passe sous le contour éditable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: candidates.map((candidate) => ({
        type: "Feature",
        properties: {
          color: LEVEL_COLORS[candidate.level],
          selected: candidate.level === selected,
        },
        geometry: candidate.geometry,
      })),
    });
  }, [candidates, selected, ready]);

  // Contour choisi et ses sommets déplaçables.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(EDIT_SOURCE) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: ring
        ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }]
        : [],
    });
    for (const marker of vertexMarkers.current) marker.remove();
    vertexMarkers.current = (ring ?? []).slice(0, -1).map((vertex, index) => {
      const element = document.createElement("div");
      element.className = "size-4 rounded-full border-2 border-white bg-primary shadow-raised";
      element.setAttribute("aria-label", `Sommet ${index + 1}`);
      const marker = new Marker({ element, draggable: true }).setLngLat(vertex).addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onMoveRef.current(index, [lng, lat]);
      });
      return marker;
    });
  }, [ring, ready]);

  if (!supported) return <MapUnavailable />;
  return (
    <div
      ref={containerRef}
      className="h-[55vh] min-h-80 w-full overflow-hidden rounded-lg border"
      role="application"
      aria-label="Image satellite de la parcelle : touchez l'intérieur du champ"
    />
  );
}
