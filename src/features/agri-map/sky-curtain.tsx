"use client";

import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  SATELLITE_BOUNDS,
  SATELLITE_DETAIL_MAX_ZOOM,
  SATELLITE_DETAIL_MIN_ZOOM,
  SATELLITE_TILE_SIZE,
  satelliteImageUrl,
  type SkyView,
} from "./map-config";

const SOURCE = "bais-before";
const OVERVIEW = "bais-before-overview";
const DETAIL = "bais-before-detail";

// Rideau avant et après : une seconde carte, sans fond ni interaction, superposée à la carte
// principale et suivant son cadrage, ne montre que l'image du mois « avant ». Un volet la découpe
// verticalement : à gauche l'avant, à droite l'après (l'image de la carte principale).
export function SkyCurtain({
  map,
  before,
  beforeLabel,
  afterLabel,
}: {
  map: MapLibreMap;
  before: SkyView;
  beforeLabel: string;
  afterLabel: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const key = `${before.layer}/${before.period}`;

  useEffect(() => {
    const container = overlayRef.current;
    if (!container) return;
    const [minLon, minLat, maxLon, maxLat] = SATELLITE_BOUNDS;
    let disposed = false;
    const overlay = new MapLibreMap({
      container,
      style: { version: 8, sources: {}, layers: [] },
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    overlay.on("load", () => {
      if (disposed) return;
      overlay.addSource(SOURCE, {
        type: "image",
        url: satelliteImageUrl(before, "overview.png"),
        coordinates: [
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat],
        ],
      });
      overlay.addLayer({
        id: OVERVIEW,
        type: "raster",
        source: SOURCE,
        paint: { "raster-fade-duration": 0 },
      });
      overlay.addSource(DETAIL, {
        type: "raster",
        tiles: [`${window.location.origin}${satelliteImageUrl(before, "{z}/{x}/{y}.png")}`],
        tileSize: SATELLITE_TILE_SIZE,
        minzoom: SATELLITE_DETAIL_MIN_ZOOM,
        maxzoom: SATELLITE_DETAIL_MAX_ZOOM,
        bounds: SATELLITE_BOUNDS,
      });
      overlay.addLayer({
        id: DETAIL,
        type: "raster",
        source: DETAIL,
        minzoom: SATELLITE_DETAIL_MIN_ZOOM,
      });
    });
    const follow = () => {
      overlay.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    };
    const resize = () => overlay.resize();
    map.on("move", follow);
    map.on("resize", resize);
    return () => {
      disposed = true;
      map.off("move", follow);
      map.off("resize", resize);
      overlay.remove();
    };
    // `key` résume la vue « avant » : l'objet before change d'identité à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <div ref={overlayRef} className="h-full w-full" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-raised"
        style={{ left: `${position}%` }}
      />
      {/* Décalé à droite du panneau des réglages sur grand écran (240px + marge), pour ne pas
          passer dessous : ce panneau n'existe qu'à partir de 1024px (agri-map.tsx, isWide). */}
      <span className="pointer-events-none absolute top-3 left-3 rounded-md border bg-card/95 px-2 py-1 text-xs font-medium lg:left-[268px]">
        Avant : {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-14 rounded-md border bg-card/95 px-2 py-1 text-xs font-medium">
        Après : {afterLabel}
      </span>
      <div className="absolute inset-x-6 bottom-14 z-10 md:inset-x-24 lg:right-10 lg:left-[268px]">
        <input
          type="range"
          min={2}
          max={98}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label="Position du rideau entre l'avant et l'après"
          className="h-11 w-full cursor-ew-resize accent-primary"
        />
      </div>
    </>
  );
}
