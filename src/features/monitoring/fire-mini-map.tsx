"use client";

import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { MAP_STYLE_URL } from "@/features/agri-map/map-config";
import { boundsAround } from "@/lib/geo/bounds";
import { hasWebGL2 } from "@/lib/webgl";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const MARGIN_M = 180;

// Petite carte de la carte d'alerte feu (accueil agriculteur, chantier K) : la parcelle et le feu
// le plus proche, sans contrôles ni interaction, juste pour situer la menace d'un coup d'œil.
export function FireMiniMap({
  farm,
  fire,
}: {
  farm: { lng: number; lat: number };
  fire: { lng: number; lat: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported] = useState(hasWebGL2);

  useEffect(() => {
    if (!supported || !containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: farm,
      zoom: 13,
      interactive: false,
      attributionControl: false,
    });
    map.fitBounds(boundsAround([farm, fire], MARGIN_M), { padding: 12, duration: 0 });
    new Marker({ color: "#2f6f3e" }).setLngLat(farm).addTo(map);
    new Marker({ color: "#c1440e" }).setLngLat(fire).addTo(map);
    return () => map.remove();
    // Cadrée une fois à l'ouverture : la carte ne suit pas d'état qui changerait ensuite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.lng, farm.lat, fire.lng, fire.lat, supported]);

  if (!supported) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Emplacement du feu par rapport à votre parcelle"
      className="h-32 w-full overflow-hidden rounded-md border"
    />
  );
}
