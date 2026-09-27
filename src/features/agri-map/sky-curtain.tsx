"use client";

import { ChevronsLeftRight } from "lucide-react";
import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  CURTAIN_KEY_STEP_PX,
  CURTAIN_WIDE_BREAKPOINT_PX,
  clampCurtainPx,
  curtainPercentToPx,
  curtainPxToPercent,
} from "./curtain-bounds";
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
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [position, setPosition] = useState(50);
  const key = `${before.layer}/${before.period}`;

  // Ramène la poignée dans la zone permise : au premier rendu (des cadres serrés peuvent laisser
  // le milieu de l'écran sous le panneau) et à chaque redimensionnement de la carte.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const clampToFrame = () => {
      const width = frame.getBoundingClientRect().width;
      const wide = window.innerWidth >= CURTAIN_WIDE_BREAKPOINT_PX;
      setPosition((current) =>
        curtainPxToPercent(clampCurtainPx(curtainPercentToPx(current, width), width, wide), width),
      );
    };
    clampToFrame();
    const observer = new ResizeObserver(clampToFrame);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  function moveTo(clientX: number) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const wide = window.innerWidth >= CURTAIN_WIDE_BREAKPOINT_PX;
    const px = clampCurtainPx(clientX - rect.left, rect.width, wide);
    setPosition(curtainPxToPercent(px, rect.width));
  }

  function nudge(deltaPx: number) {
    const frame = frameRef.current;
    if (!frame) return;
    const width = frame.getBoundingClientRect().width;
    const wide = window.innerWidth >= CURTAIN_WIDE_BREAKPOINT_PX;
    const currentPx = curtainPercentToPx(position, width);
    setPosition(curtainPxToPercent(clampCurtainPx(currentPx + deltaPx, width, wide), width));
  }

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
    <div ref={frameRef} className="pointer-events-none absolute inset-0">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <div ref={overlayRef} className="h-full w-full" />
      </div>
      {/* Décalé à droite du panneau des réglages sur grand écran (240px + marge), pour ne pas
          passer dessous : ce panneau n'existe qu'à partir de 1024px (agri-map.tsx, isWide). */}
      <span className="pointer-events-none absolute top-3 left-3 rounded-md border bg-card/95 px-2 py-1 text-xs font-medium lg:left-[268px]">
        Avant : {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-14 rounded-md border bg-card/95 px-2 py-1 text-xs font-medium">
        Après : {afterLabel}
      </span>
      {/* Poignée posée sur la ligne de partage elle-même (comme un comparateur d'images courant),
          plutôt qu'une glissière séparée dont la position ne coïnciderait pas avec la ligne. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Rideau entre l'avant et l'après"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)} %`}
        className="pointer-events-auto absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ left: `${position}%` }}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) moveTo(event.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-CURTAIN_KEY_STEP_PX);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(CURTAIN_KEY_STEP_PX);
          }
        }}
      >
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-white shadow-raised" />
        <span
          aria-hidden
          className="relative flex size-11 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-raised"
        >
          <ChevronsLeftRight className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}
