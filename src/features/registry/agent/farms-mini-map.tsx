"use client";

import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/feedback/map-unavailable";
import { BENIN_BOUNDS, FARM_COLORS, MAP_STYLE_URL } from "@/features/agri-map/map-config";
import { hasWebGL2 } from "@/lib/webgl";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

export interface MiniMapFarm {
  id: string;
  lng: number;
  lat: number;
  label: string;
  status: keyof typeof FARM_COLORS;
}

const SOURCE = "bais-listed-farms";
const LAYER = "bais-listed-farm-points";

function collection(farms: readonly MiniMapFarm[]) {
  return {
    type: "FeatureCollection" as const,
    features: farms.map((farm) => ({
      type: "Feature" as const,
      id: farm.id,
      geometry: { type: "Point" as const, coordinates: [farm.lng, farm.lat] },
      properties: { id: farm.id, label: farm.label, status: farm.status },
    })),
  };
}

// Mini-carte de la liste des exploitations : les exploitations affichées, en points colorés par
// statut de vérification, cadrées sur elles. Un point touché ouvre la fiche ; la carte suit la
// page de la liste (recherche, filtre, page suivante).
export function FarmsMiniMap({ farms }: { farms: readonly MiniMapFarm[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [supported] = useState(hasWebGL2);
  const [ready, setReady] = useState(false);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!supported || !containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: BENIN_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      maxZoom: 15,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource(SOURCE, { type: "geojson", data: collection([]) });
      map.addLayer({
        id: LAYER,
        type: "circle",
        source: SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8],
          "circle-color": [
            "match",
            ["get", "status"],
            "FIELD_VERIFIED",
            FARM_COLORS.FIELD_VERIFIED,
            "AGENT_VERIFIED",
            FARM_COLORS.AGENT_VERIFIED,
            "DISPUTED",
            FARM_COLORS.DISPUTED,
            FARM_COLORS.DECLARED,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      map.on("click", LAYER, (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") routerRef.current.push(`/agent/exploitations/${id}` as Route);
      });
      map.on("mouseenter", LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER, () => {
        map.getCanvas().style.cursor = "";
      });
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [supported]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(collection(farms));
    if (farms.length === 0) return;
    const bounds = new LngLatBounds();
    for (const farm of farms) bounds.extend([farm.lng, farm.lat]);
    map.fitBounds(bounds, { padding: 32, maxZoom: 13, duration: 0 });
  }, [ready, farms]);

  if (!supported) return <MapUnavailable />;
  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Carte des exploitations affichées"
      className="h-full w-full"
    />
  );
}
