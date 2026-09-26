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
import { MapUnavailable } from "@/components/feedback/map-unavailable";
import { hasWebGL2 } from "@/lib/webgl";
import { SkyCurtain } from "./sky-curtain";

// Le worker de MapLibre est servi en fichiers statiques (scripts/copy-maplibre-worker.mjs) :
// le bundler de Next ne sait pas exposer celui embarqué par la bibliothèque.
setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
import type { CommuneStats } from "@/modules/analytics";
import {
  BENIN_BOUNDS,
  BENIN_CENTER,
  CHOROPLETH_SCALE,
  COMMUNE_FILL_OPACITY,
  CROP_MAP_QUARTERS,
  FIELD_COLORS,
  FIELD_MIN_ZOOM,
  FIELDS_ATTRIBUTION,
  NO_DATA_COLOR,
  FARM_COLORS,
  HIRES_IMAGERY,
  RELIEF,
  INITIAL_ZOOM,
  LAYER_IDS,
  MAP_STYLE_URL,
  OUTLINE_COLOR,
  PARCEL_COLORS,
  PARCEL_MIN_ZOOM,
  SATELLITE_BOUNDS,
  SATELLITE_DETAIL_MAX_ZOOM,
  SATELLITE_DETAIL_MIN_ZOOM,
  SATELLITE_IDS,
  SATELLITE_TILE_SIZE,
  SOURCE_IDS,
  TILE_URL_TEMPLATE,
  classIndex,
  copernicusAttribution,
  cropMapAttribution,
  WORLDCEREAL_ATTRIBUTION,
  WORLDCEREAL_QUARTERS,
  quantileBreaks,
  satelliteImageUrl,
  type MetricKey,
  type SkyView,
} from "./map-config";
import { FIRE_ATTRIBUTION, hideFireLayer, showFireLayer, type FireCollection } from "./fire-layer";

const BOUNDARIES_ATTRIBUTION = "Limites administratives : geoBoundaries (CC BY 4.0)";

function attributionControl(extras: readonly string[]): AttributionControl {
  return new AttributionControl({
    compact: true,
    customAttribution: [BOUNDARIES_ATTRIBUTION, ...extras],
  });
}

/** Remplace le contrôle d'attribution (ses mentions sont fixées à la construction). */
function swapAttribution(
  map: MapLibreMap,
  current: AttributionControl | null,
  extras: readonly string[],
): AttributionControl {
  if (current) map.removeControl(current);
  const next = attributionControl(extras);
  map.addControl(next, "bottom-right");
  return next;
}

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
  /** Image satellite sous les limites ; null : carte des communes seule. */
  sky?: SkyView | null;
  /** Carte des cultures par satellite sous les limites et les parcelles (ADR-0021). */
  cropMap?: boolean;
  /** Terres cultivées 2021 (ESA WorldCereal), carte de référence sous les limites et les champs. */
  worldCereal?: boolean;
  /** Tuiles détaillées aux zooms rapprochés (comptes connectés seulement). */
  skyDetail?: boolean;
  /** Contours des parcelles à partir du zoom 12, cliquables (comptes qui lisent le registre). */
  showParcels?: boolean;
  selectedParcelId?: string | null;
  onSelectParcel?: (id: string | null) => void;
  /** Emprise à cadrer (fiche parcelle ouverte depuis un lien) : [ouest, sud, est, nord]. */
  focusBounds?: [number, number, number, number] | null;
  /** Niveau de zoom après chaque déplacement (invite à se rapprocher pour voir les champs). */
  onZoomChange?: (zoom: number) => void;
  /** Champs détectés (contours de référence) à partir du zoom 12, non nominatifs. */
  showFields?: boolean;
  /** Relief 3D : terrain soulevé et vue inclinée ; `onReliefSlow` quand l'affichage saccade. */
  relief?: boolean;
  /** Mois « avant » d'une comparaison : un rideau le montre à gauche de l'image affichée. */
  skyBefore?: { view: SkyView; label: string; afterLabel: string } | null;
  onReliefSlow?: () => void;
  /** Champs touchés avant attribution (ADR-0029) : trait vif et épais. */
  touchedFieldIds?: readonly string[];
  /** Un agent touche un champ détecté pour l'attribuer ; absent : la couche n'est pas cliquable. */
  onSelectField?: (id: string, position: [number, number]) => void;
  /** Feux actifs à afficher au-dessus de tout (ADR-0022) ; null : pas de couche de feux. */
  fires?: FireCollection | null;
}

// Carte MapLibre : fond OpenStreetMap, communes en choroplèthe alimentée par les agrégats,
// contours des départements, points d'exploitations à partir du zoom 9. La couleur d'une
// commune vient d'un feature-state posé depuis les statistiques : la tuile reste stable
// et mise en cache, seules les valeurs changent avec les filtres.
const NO_FIELDS: readonly string[] = [];

export function MapCanvas({
  statsByCode,
  metric,
  showFarms,
  selectedCommuneCode,
  onSelectCommune,
  onHoverCommune,
  onReady,
  sky = null,
  skyDetail = false,
  cropMap = false,
  worldCereal = false,
  showParcels = false,
  selectedParcelId = null,
  onSelectParcel,
  focusBounds = null,
  onZoomChange,
  fires = null,
  showFields = false,
  relief = false,
  skyBefore = null,
  onReliefSlow,
  touchedFieldIds = NO_FIELDS,
  onSelectField,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const attributionRef = useRef<AttributionControl | null>(null);
  // Mentions propres aux couches affichées (Copernicus, NASA FIRMS), réunies dans un contrôle.
  const extrasRef = useRef<{
    sky: string | null;
    crops: string | null;
    reference: string | null;
    fires: string | null;
    fields: string | null;
    relief: string | null;
  }>({
    sky: null,
    crops: null,
    reference: null,
    fires: null,
    fields: null,
    relief: null,
  });
  const refreshAttribution = (map: MapLibreMap) => {
    const {
      sky: skyMention,
      crops: cropMention,
      reference: referenceMention,
      fires: fireMention,
      fields: fieldMention,
      relief: reliefMention,
    } = extrasRef.current;
    const extras = [
      skyMention,
      cropMention,
      referenceMention,
      fireMention,
      fieldMention,
      reliefMention,
    ].filter((mention): mention is string => !!mention);
    attributionRef.current = swapAttribution(map, attributionRef.current, extras);
  };
  // WebGL2 absent : avis à la place de la carte, sans créer MapLibre (qui planterait).
  const [supported] = useState(hasWebGL2);
  const hoveredRef = useRef<string | null>(null);
  // Passe à vrai quand les sources et couches existent : les effets de peinture attendent ce signal.
  const [ready, setReady] = useState(false);
  // Carte exposée au rideau avant et après, qui suit son cadrage.
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  // Les gestionnaires de la carte sont posés une fois, au chargement : ils lisent les rappels
  // courants par cette référence plutôt que ceux du premier rendu.
  const callbacksRef = useRef({
    onSelectCommune,
    onSelectParcel,
    onSelectField,
    onZoomChange,
    onReliefSlow,
  });
  useEffect(() => {
    callbacksRef.current = {
      onSelectCommune,
      onSelectParcel,
      onSelectField,
      onZoomChange,
      onReliefSlow,
    };
  }, [onSelectCommune, onSelectParcel, onSelectField, onZoomChange, onReliefSlow]);

  useEffect(() => {
    if (!supported || !containerRef.current || mapRef.current) return;
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
    attributionRef.current = attributionControl([]);
    map.addControl(attributionRef.current, "bottom-right");
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
      map.addSource(SOURCE_IDS.parcels, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("parcels")}`],
        minzoom: PARCEL_MIN_ZOOM,
        maxzoom: 14,
        promoteId: "id",
      });
      map.addSource(SOURCE_IDS.fields, {
        type: "vector",
        tiles: [`${window.location.origin}${TILE_URL_TEMPLATE("fields")}`],
        minzoom: FIELD_MIN_ZOOM,
        maxzoom: 14,
        promoteId: "id",
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
          "fill-opacity": COMMUNE_FILL_OPACITY,
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
      // Champs détectés sous les parcelles : voile léger, trait fin, plus net quand aucune
      // parcelle enregistrée ne recouvre le champ.
      map.addLayer({
        id: LAYER_IDS.fieldFill,
        type: "fill",
        source: SOURCE_IDS.fields,
        "source-layer": "fields",
        minzoom: FIELD_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "touched"], false],
            FIELD_COLORS.touched,
            FIELD_COLORS.toRegister,
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "touched"], false],
            0.32,
            ["boolean", ["get", "registered"], false],
            0,
            0.08,
          ],
        },
      });
      map.addLayer({
        id: LAYER_IDS.fieldLine,
        type: "line",
        source: SOURCE_IDS.fields,
        "source-layer": "fields",
        minzoom: FIELD_MIN_ZOOM,
        layout: { visibility: "none", "line-join": "round" },
        paint: {
          // Touché par l'agent : trait vif et épais, lisible au soleil, avant l'attribution.
          "line-color": [
            "case",
            ["boolean", ["feature-state", "touched"], false],
            FIELD_COLORS.touched,
            ["boolean", ["get", "registered"], false],
            FIELD_COLORS.registered,
            FIELD_COLORS.toRegister,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "touched"], false],
            3.5,
            ["boolean", ["get", "registered"], false],
            0.6,
            1,
          ],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: LAYER_IDS.parcelFill,
        type: "fill",
        source: SOURCE_IDS.parcels,
        "source-layer": "parcels",
        minzoom: PARCEL_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["coalesce", ["get", "color"], PARCEL_COLORS.noCrop],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.6,
            ["boolean", ["feature-state", "hover"], false],
            0.5,
            0.38,
          ],
        },
      });
      map.addLayer({
        id: LAYER_IDS.parcelLine,
        type: "line",
        source: SOURCE_IDS.parcels,
        "source-layer": "parcels",
        minzoom: PARCEL_MIN_ZOOM,
        layout: { visibility: "none", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            PARCEL_COLORS.selected,
            ["==", ["get", "vegetation"], "TO_VERIFY"],
            PARCEL_COLORS.toVerify,
            PARCEL_COLORS.outline,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["==", ["get", "vegetation"], "TO_VERIFY"],
            2,
            1.2,
          ],
        },
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
        // Un clic sur une parcelle ouvre sa fiche, pas celle de la commune qui la contient.
        if (
          map.getLayoutProperty(LAYER_IDS.parcelFill, "visibility") === "visible" &&
          map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.parcelFill] }).length > 0
        ) {
          return;
        }
        const feature = event.features?.[0];
        const code = typeof feature?.id === "string" ? feature.id : null;
        callbacksRef.current.onSelectCommune(code);
      });
      map.on("click", LAYER_IDS.parcelFill, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = typeof feature?.id === "string" ? feature.id : null;
        if (id) callbacksRef.current.onSelectParcel?.(id);
      });
      // Toucher un champ détecté (ADR-0029) : une parcelle déjà ouverte au même point l'emporte.
      map.on("click", LAYER_IDS.fieldFill, (event: MapLayerMouseEvent) => {
        if (
          map.getLayoutProperty(LAYER_IDS.parcelFill, "visibility") === "visible" &&
          map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.parcelFill] }).length > 0
        ) {
          return;
        }
        const feature = event.features?.[0];
        const id = typeof feature?.id === "string" ? feature.id : null;
        if (id) callbacksRef.current.onSelectField?.(id, [event.lngLat.lng, event.lngLat.lat]);
      });
      map.on("mouseenter", LAYER_IDS.fieldFill, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER_IDS.fieldFill, () => {
        map.getCanvas().style.cursor = "";
      });
      let hoveredParcel: string | null = null;
      map.on("mousemove", LAYER_IDS.parcelFill, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = typeof feature?.id === "string" ? feature.id : null;
        if (hoveredParcel && hoveredParcel !== id) {
          map.setFeatureState(
            { source: SOURCE_IDS.parcels, sourceLayer: "parcels", id: hoveredParcel },
            { hover: false },
          );
        }
        if (id) {
          map.setFeatureState(
            { source: SOURCE_IDS.parcels, sourceLayer: "parcels", id },
            { hover: true },
          );
        }
        hoveredParcel = id;
      });
      map.on("mouseleave", LAYER_IDS.parcelFill, () => {
        if (hoveredParcel) {
          map.setFeatureState(
            { source: SOURCE_IDS.parcels, sourceLayer: "parcels", id: hoveredParcel },
            { hover: false },
          );
        }
        hoveredParcel = null;
      });

      map.on("zoomend", () => callbacksRef.current.onZoomChange?.(map.getZoom()));
      callbacksRef.current.onZoomChange?.(map.getZoom());

      setReady(true);
      setMapInstance(map);
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
      setMapInstance(null);
    };
    // La carte n'est construite qu'une fois ; les mises à jour passent par les effets suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Peinture : classes calculées sur la métrique courante, appliquées par feature-state.
  // MapLibre n'efface une propriété d'état qu'avec l'identifiant de la commune : on retient les
  // communes peintes au tour précédent pour effacer celles qui sortent du résultat (filtre sans
  // exploitation), qui repassent ainsi hors échelle.
  const paintedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const values = [...statsByCode.values()].map((item) => item[metric]);
    const breaks = quantileBreaks(values);
    for (const code of paintedRef.current) {
      if (!statsByCode.has(code)) {
        map.removeFeatureState({ source: SOURCE_IDS.communes, sourceLayer: "communes", id: code });
      }
    }
    for (const [code, item] of statsByCode) {
      map.setFeatureState(
        { source: SOURCE_IDS.communes, sourceLayer: "communes", id: code },
        { classIndex: classIndex(item[metric], breaks), value: item[metric] },
      );
    }
    paintedRef.current = new Set(statsByCode.keys());
  }, [statsByCode, metric, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty(LAYER_IDS.farmPoints, "visibility", showFarms ? "visible" : "none");
  }, [showFarms, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visibility = showParcels ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.parcelFill, "visibility", visibility);
    map.setLayoutProperty(LAYER_IDS.parcelLine, "visibility", visibility);
  }, [showParcels, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visibility = showFields ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.fieldFill, "visibility", visibility);
    map.setLayoutProperty(LAYER_IDS.fieldLine, "visibility", visibility);
    const mention = showFields ? FIELDS_ATTRIBUTION : null;
    if (extrasRef.current.fields !== mention) {
      extrasRef.current.fields = mention;
      refreshAttribution(map);
    }
  }, [showFields, ready]);

  const selectedParcelRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const previous = selectedParcelRef.current;
    if (previous && previous !== selectedParcelId) {
      map.setFeatureState(
        { source: SOURCE_IDS.parcels, sourceLayer: "parcels", id: previous },
        { selected: false },
      );
    }
    if (selectedParcelId) {
      map.setFeatureState(
        { source: SOURCE_IDS.parcels, sourceLayer: "parcels", id: selectedParcelId },
        { selected: true },
      );
    }
    selectedParcelRef.current = selectedParcelId;
  }, [selectedParcelId, ready]);

  const touchedFieldsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const next = new Set(touchedFieldIds);
    const source = { source: SOURCE_IDS.fields, sourceLayer: "fields" };
    for (const id of touchedFieldsRef.current) {
      if (!next.has(id)) map.setFeatureState({ ...source, id }, { touched: false });
    }
    for (const id of next) map.setFeatureState({ ...source, id }, { touched: true });
    touchedFieldsRef.current = next;
  }, [touchedFieldIds, ready]);

  // Cadrage demandé (fiche ouverte depuis un lien) : la parcelle entière, sans trop grossir.
  const focusKey = focusBounds ? focusBounds.join(",") : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusBounds) return;
    map.fitBounds(
      [
        [focusBounds[0], focusBounds[1]],
        [focusBounds[2], focusBounds[3]],
      ],
      // Sans imagerie haute résolution, au-delà de 15 les pixels de 10 m ne montrent plus rien.
      { padding: 80, maxZoom: HIRES_IMAGERY ? 16 : 15, duration: 900 },
    );
    // focusKey résume l'emprise : le tableau change d'identité à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  // Vue du ciel : image d'ensemble du pays aux petits zooms, tuiles de 512 px au-delà, sous les
  // limites administratives. Les communes deviennent transparentes (survol et clic gardés) pour
  // laisser voir l'image ; la mention Copernicus accompagne les deux sources.
  const skyKey = sky ? `${sky.layer}/${sky.period}/${skyDetail ? "detail" : "overview"}` : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const hires = sky?.layer === "couleur-naturelle" && skyDetail ? HIRES_IMAGERY : null;
    for (const id of [
      HIRES_IMAGERY?.layerId,
      SATELLITE_IDS.detailLayer,
      SATELLITE_IDS.overviewLayer,
    ]) {
      if (id && map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of [
      HIRES_IMAGERY?.sourceId,
      SATELLITE_IDS.detailSource,
      SATELLITE_IDS.overviewSource,
    ]) {
      if (id && map.getSource(id)) map.removeSource(id);
    }
    map.setPaintProperty(LAYER_IDS.communeFill, "fill-opacity", sky ? 0 : COMMUNE_FILL_OPACITY);
    if (!sky) return;
    const [minLon, minLat, maxLon, maxLat] = SATELLITE_BOUNDS;
    const attribution = copernicusAttribution(sky.period);
    map.addSource(SATELLITE_IDS.overviewSource, {
      type: "image",
      url: satelliteImageUrl(sky, "overview.png"),
      coordinates: [
        [minLon, maxLat],
        [maxLon, maxLat],
        [maxLon, minLat],
        [minLon, minLat],
      ],
    });
    map.addLayer(
      {
        id: SATELLITE_IDS.overviewLayer,
        type: "raster",
        source: SATELLITE_IDS.overviewSource,
        paint: { "raster-fade-duration": 0 },
      },
      LAYER_IDS.communeFill,
    );
    if (skyDetail) {
      map.addSource(SATELLITE_IDS.detailSource, {
        type: "raster",
        tiles: [`${window.location.origin}${satelliteImageUrl(sky, "{z}/{x}/{y}.png")}`],
        tileSize: SATELLITE_TILE_SIZE,
        minzoom: SATELLITE_DETAIL_MIN_ZOOM,
        maxzoom: SATELLITE_DETAIL_MAX_ZOOM,
        bounds: SATELLITE_BOUNDS,
      });
      map.addLayer(
        {
          id: SATELLITE_IDS.detailLayer,
          type: "raster",
          source: SATELLITE_IDS.detailSource,
          minzoom: SATELLITE_DETAIL_MIN_ZOOM,
        },
        LAYER_IDS.communeFill,
      );
    }
    if (hires) {
      map.addSource(hires.sourceId, {
        type: "raster",
        tiles: [hires.url],
        tileSize: 256,
        minzoom: hires.minZoom,
        maxzoom: 19,
      });
      map.addLayer(
        { id: hires.layerId, type: "raster", source: hires.sourceId, minzoom: hires.minZoom },
        LAYER_IDS.communeFill,
      );
    }
    // Une source d'image ne porte pas d'attribution : la mention Copernicus passe par le
    // contrôle, recréé avec elle (ses mentions sont fixées à la construction).
    const extras = extrasRef.current;
    extras.sky = hires ? `${attribution}, ${hires.attribution}` : attribution;
    refreshAttribution(map);
    return () => {
      extras.sky = null;
      if (mapRef.current) refreshAttribution(mapRef.current);
    };
    // skyKey résume sky et skyDetail : l'objet sky change d'identité à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skyKey, ready]);

  // Feux actifs (ADR-0022), dans leur propre effet : la couche est ajoutée en dernier, donc
  // au-dessus des communes et des parcelles, avec la mention NASA FIRMS.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!fires) {
      hideFireLayer(map);
      if (extrasRef.current.fires) {
        extrasRef.current.fires = null;
        refreshAttribution(map);
      }
      return;
    }
    showFireLayer(map, fires);
    if (!extrasRef.current.fires) {
      extrasRef.current.fires = FIRE_ATTRIBUTION;
      refreshAttribution(map);
    }
  }, [fires, ready]);
  // Carte des cultures : une image d'ensemble du pays, sous les limites et les parcelles, pixels
  // nets (classes, pas de dégradé). Déclarée après la vue du ciel, qui remet les communes en
  // couleur quand elle se retire : cet effet les rend transparentes ensuite.
  // Quatre images, une par quart du pays, calculées à l'avance ; un quart pas encore prêt reste
  // simplement vide.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !cropMap) return;
    map.setPaintProperty(LAYER_IDS.communeFill, "fill-opacity", 0);
    for (const quarter of CROP_MAP_QUARTERS) {
      map.addSource(quarter.source, {
        type: "image",
        url: quarter.url,
        coordinates: quarter.coordinates,
      });
      map.addLayer(
        {
          id: quarter.layer,
          type: "raster",
          source: quarter.source,
          paint: {
            "raster-fade-duration": 0,
            "raster-resampling": "nearest",
            "raster-opacity": 0.85,
          },
        },
        LAYER_IDS.communeFill,
      );
    }
    const extras = extrasRef.current;
    extras.crops = cropMapAttribution();
    refreshAttribution(map);
    return () => {
      const current = mapRef.current;
      if (!current) return;
      for (const quarter of CROP_MAP_QUARTERS) {
        if (current.getLayer(quarter.layer)) current.removeLayer(quarter.layer);
        if (current.getSource(quarter.source)) current.removeSource(quarter.source);
      }
      current.setPaintProperty(LAYER_IDS.communeFill, "fill-opacity", COMMUNE_FILL_OPACITY);
      extras.crops = null;
      refreshAttribution(current);
    };
    // refreshAttribution ne lit que des références : la carte n'est recréée qu'avec cropMap.
  }, [cropMap, ready]);

  // Terres cultivées 2021 (ESA WorldCereal) : quatre images statiques, sous les limites et les
  // champs détectés, pour comparer une carte de référence à la nôtre. Même rendu net que la carte
  // des cultures, et sa mention CC BY 4.0 dans l'attribution.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !worldCereal) return;
    map.setPaintProperty(LAYER_IDS.communeFill, "fill-opacity", 0);
    for (const quarter of WORLDCEREAL_QUARTERS) {
      map.addSource(quarter.source, {
        type: "image",
        url: quarter.url,
        coordinates: quarter.coordinates,
      });
      map.addLayer(
        {
          id: quarter.layer,
          type: "raster",
          source: quarter.source,
          paint: {
            "raster-fade-duration": 0,
            "raster-resampling": "nearest",
            "raster-opacity": 0.8,
          },
        },
        LAYER_IDS.communeFill,
      );
    }
    const extras = extrasRef.current;
    extras.reference = WORLDCEREAL_ATTRIBUTION;
    refreshAttribution(map);
    return () => {
      const current = mapRef.current;
      if (!current) return;
      for (const quarter of WORLDCEREAL_QUARTERS) {
        if (current.getLayer(quarter.layer)) current.removeLayer(quarter.layer);
        if (current.getSource(quarter.source)) current.removeSource(quarter.source);
      }
      current.setPaintProperty(LAYER_IDS.communeFill, "fill-opacity", COMMUNE_FILL_OPACITY);
      extras.reference = null;
      refreshAttribution(current);
    };
    // Même règle que la carte des cultures : l'effet ne dépend que de worldCereal et de ready.
  }, [worldCereal, ready]);

  // Relief 3D : source d'élévation, terrain soulevé et vue inclinée. Une sonde mesure la fluidité
  // pendant les premières secondes et coupe le relief si l'appareil peine (`onReliefSlow`).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !relief) return;
    if (!map.getSource(RELIEF.sourceId)) {
      map.addSource(RELIEF.sourceId, {
        type: "raster-dem",
        tiles: [RELIEF.url],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: RELIEF.maxZoom,
      });
    }
    map.setTerrain({ source: RELIEF.sourceId, exaggeration: RELIEF.exaggeration });
    map.easeTo({ pitch: RELIEF.pitch, duration: 800 });
    const extras = extrasRef.current;
    extras.relief = RELIEF.attribution;
    refreshAttribution(map);

    let frames = 0;
    let frame = 0;
    const started = performance.now();
    const probe = () => {
      frames += 1;
      const elapsed = performance.now() - started;
      if (elapsed >= RELIEF.probeMs) {
        if ((frames * 1000) / elapsed < RELIEF.minFps) callbacksRef.current.onReliefSlow?.();
        return;
      }
      frame = requestAnimationFrame(probe);
    };
    frame = requestAnimationFrame(probe);

    return () => {
      cancelAnimationFrame(frame);
      const current = mapRef.current;
      if (!current) return;
      current.setTerrain(null);
      current.easeTo({ pitch: 0, duration: 500 });
      extras.relief = null;
      refreshAttribution(current);
    };
  }, [relief, ready]);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const previous = selectedRef.current;
    if (previous && previous !== selectedCommuneCode) {
      map.setFeatureState(
        { source: SOURCE_IDS.communes, sourceLayer: "communes", id: previous },
        { selected: false },
      );
    }
    if (selectedCommuneCode) {
      map.setFeatureState(
        { source: SOURCE_IDS.communes, sourceLayer: "communes", id: selectedCommuneCode },
        { selected: true },
      );
    }
    selectedRef.current = selectedCommuneCode;
  }, [selectedCommuneCode, ready]);

  if (!supported) return <MapUnavailable />;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Carte agricole du Bénin"
      />
      {mapInstance && skyBefore && sky ? (
        <SkyCurtain
          map={mapInstance}
          before={skyBefore.view}
          beforeLabel={skyBefore.label}
          afterLabel={skyBefore.afterLabel}
        />
      ) : null}
    </div>
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
    NO_DATA_COLOR,
    [
      "match",
      ["feature-state", "classIndex"],
      ...stops,
      NO_DATA_COLOR,
    ] as unknown as ExpressionSpecification,
  ] as ExpressionSpecification;
}
