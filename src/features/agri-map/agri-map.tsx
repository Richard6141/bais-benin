"use client";

import type { Route } from "next";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/lib/use-media-query";
import type { HoveredCommune } from "./map-canvas";
import { CropMapLegend } from "./crop-map-legend";
import {
  CROP_MAP_LAYER,
  METRICS,
  PARCEL_MIN_ZOOM,
  SKY_LAYERS,
  quantileBreaks,
  type BaseLayer,
  type MetricKey,
  type SkyLayer,
} from "./map-config";
import {
  MapFiltersBar,
  MapSecondaryFilters,
  secondaryFiltersActive,
  type FilterOptions,
} from "./map-filters";
import { MapLayersSheet, MapLegendToggle } from "./map-layers-sheet";
import { MapLegend, SkyLegend } from "./map-legend";
import { MapPanelDrawer } from "./map-panel-drawer";
import { MapSidePanel } from "./map-side-panel";
import { FireControl, FireLegend } from "./fire-control";
import type { FireWindowParam } from "./fire-layer";
import { ParcelPanel } from "./parcel-panel";
import { SkyControl } from "./sky-control";
import { useFires } from "./use-fires";
import { useImageryCatalog } from "./use-imagery-catalog";
import { FieldAttributionSheet } from "@/features/registry/parcel-survey/field-attribution-sheet";
import { FieldsControl } from "./fields-control";
import { filtersToSearchParams, useTerritoryStats, type MapFilters } from "./use-territory-stats";

// MapLibre manipule window et WebGL : chargé côté client uniquement, hors du rendu serveur.
const MapCanvas = dynamic(() => import("./map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface AgriMapProps {
  options: FilterOptions;
  canShowFarms: boolean;
  /** Filtre par statut de vérification (adresse) : ministère seulement, refusé par l'API sinon. */
  canFilterByStatus: boolean;
  /** Tuiles satellite détaillées : agents et ministère seulement (quota Copernicus, revue R2). */
  canSeeSkyDetail: boolean;
  /** Contours des parcelles et fiche au clic : comptes qui lisent le registre (farm.read). */
  canInspectParcels?: boolean;
  /** Début de l'adresse de la fiche d'exploitation de l'espace, quand il en a une (agent). */
  farmHrefBase?: string;
  /** Toucher un champ détecté pour l'attribuer à une exploitation (ADR-0029) : agent seulement. */
  canAttributeFields?: boolean;
  /** Compte connecté : file d'attente hors ligne propre à l'agent qui attribue un champ. */
  userId?: string;
}

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
const BASE_KEYS: BaseLayer[] = [...(Object.keys(SKY_LAYERS) as SkyLayer[]), CROP_MAP_LAYER];

interface SkyParams {
  layer: BaseLayer | null;
  period: string | null;
}

function readSky(params: URLSearchParams): SkyParams {
  const layer = params.get("ciel");
  return {
    layer: BASE_KEYS.includes(layer as BaseLayer) ? (layer as BaseLayer) : null,
    period: params.get("mois"),
  };
}

function readFilters(params: URLSearchParams, allowStatus: boolean): MapFilters {
  const status = allowStatus ? params.get("verificationStatus") : null;
  return {
    cropCode: params.get("cropCode") ?? undefined,
    campaignCode: params.get("campaignCode") ?? undefined,
    departementCode: params.get("departementCode") ?? undefined,
    verificationStatus:
      status === "DECLARED" ||
      status === "AGENT_VERIFIED" ||
      status === "FIELD_VERIFIED" ||
      status === "DISPUTED"
        ? status
        : undefined,
  };
}

// Les filtres vivent dans l'URL : une vue se partage par lien et survit au rechargement.
export function AgriMap({
  options,
  canShowFarms,
  canFilterByStatus,
  canSeeSkyDetail,
  canInspectParcels = false,
  farmHrefBase,
  canAttributeFields = false,
  userId,
}: AgriMapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => readFilters(searchParams, canFilterByStatus),
    [searchParams, canFilterByStatus],
  );
  const metricParam = searchParams.get("metric");
  const metric: MetricKey = METRIC_KEYS.includes(metricParam as MetricKey)
    ? (metricParam as MetricKey)
    : "farmCount";
  // Vue du ciel dans l'adresse aussi : ?ciel=ndvi&mois=2026-08.
  const skyParams = useMemo(() => readSky(searchParams), [searchParams]);
  const catalog = useImageryCatalog();
  const readyCatalog = catalog.status === "ready" ? catalog.catalog : null;
  const skyPeriodEntry =
    readyCatalog?.periods.find((entry) => entry.period === skyParams.period) ??
    readyCatalog?.periods.find((entry) => entry.period === readyCatalog.defaultPeriod);
  const skyPeriod = skyPeriodEntry?.period ?? null;
  const skyLayer = skyParams.layer === CROP_MAP_LAYER ? null : skyParams.layer;
  const sky =
    skyLayer && skyPeriod && readyCatalog?.imageryAvailable
      ? { layer: skyLayer, period: skyPeriod }
      : null;
  // Feux actifs dans l'adresse aussi : ?feux=24h ou ?feux=7j (ADR-0022).
  const feuxParam = searchParams.get("feux");
  const fireWindow: FireWindowParam | null =
    feuxParam === "24h" || feuxParam === "7j" ? feuxParam : null;
  const fires = useFires(fireWindow);
  // Champs détectés dans l'adresse aussi : ?champs=1 (ADR-0029), pour les comptes du registre.
  const showFields = canInspectParcels && searchParams.get("champs") === "1";
  // Carte des cultures (ADR-0021) : ?ciel=cultures, sans mois (les 12 derniers).
  // Sans attendre le catalogue des périodes : la carte n'a besoin que de ses quarts en cache, et
  // la légende dit quand ils ne sont pas encore prêts.
  const cropMap =
    skyParams.layer === CROP_MAP_LAYER &&
    !(catalog.status === "ready" && !catalog.catalog.imageryAvailable);
  const [showFarms, setShowFarms] = useState(false);
  // Champ(s) touché(s) avant attribution (ADR-0029) : la feuille s'ouvre dès le premier geste.
  const [touchedFieldIds, setTouchedFieldIds] = useState<string[] | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(searchParams.get("commune"));
  const [hovered, setHovered] = useState<HoveredCommune | null>(null);
  // Parcelle ouverte, dans l'adresse aussi (?parcelle=<id>) : un lien mène droit au champ.
  const [parcelId, setParcelId] = useState<string | null>(() =>
    canInspectParcels ? searchParams.get("parcelle") : null,
  );
  // Cadrage sur la parcelle seulement quand la fiche vient d'un lien : après un clic, la carte
  // montre déjà le champ et ne doit pas bouger.
  const [focusFromLink, setFocusFromLink] = useState(parcelId !== null);
  const [focusBounds, setFocusBounds] = useState<[number, number, number, number] | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  const stats = useTerritoryStats(filters);
  const cropNames = useMemo(
    () => new Map(options.crops.map((crop) => [crop.code, crop.nameFr])),
    [options.crops],
  );
  const breaks = useMemo(
    () => quantileBreaks([...stats.byCode.values()].map((item) => item[metric])),
    [stats.byCode, metric],
  );
  const selected = selectedCode ? (stats.byCode.get(selectedCode) ?? null) : null;

  const pushState = useCallback(
    (
      nextFilters: MapFilters,
      nextMetric: MetricKey,
      nextCommune: string | null,
      nextSky: SkyParams = skyParams,
      nextParcel: string | null = parcelId,
      nextFires: FireWindowParam | null = fireWindow,
      nextFields: boolean = showFields,
    ) => {
      const params = filtersToSearchParams(nextFilters);
      if (nextMetric !== "farmCount") params.set("metric", nextMetric);
      if (nextCommune) params.set("commune", nextCommune);
      if (nextSky.layer) params.set("ciel", nextSky.layer);
      if (nextSky.layer && nextSky.period) params.set("mois", nextSky.period);
      if (nextParcel) params.set("parcelle", nextParcel);
      if (nextFires) params.set("feux", nextFires);
      if (nextFields) params.set("champs", "1");
      const query = params.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    },
    [router, pathname, skyParams, parcelId, fireWindow, showFields],
  );

  const selectParcel = (id: string | null) => {
    setParcelId(id);
    setFocusFromLink(false);
    pushState(filters, metric, selectedCode, skyParams, id);
  };

  const hoveredStats = hovered ? stats.byCode.get(hovered.code) : undefined;
  const isWide = useMediaQuery("(min-width: 1024px)");

  const filterProps = {
    options,
    filters,
    metric,
    showFarms,
    canShowFarms,
    onChange: (next: MapFilters) => {
      setSelectedCode(null);
      pushState(next, metric, null);
    },
    onMetricChange: (next: MetricKey) => pushState(filters, next, selectedCode),
    onShowFarmsChange: setShowFarms,
  };
  // Réglages des couches et légende : sur la carte en grand écran, dans la feuille « Couches » et
  // la légende repliable sur téléphone (un seul exemplaire rendu à la fois).
  const layerControls = (
    <>
      <div className="pointer-events-auto">
        <SkyControl
          catalog={catalog}
          layer={skyParams.layer}
          period={skyPeriod}
          onLayerChange={(layer) =>
            pushState(filters, metric, selectedCode, { layer, period: skyParams.period })
          }
          onPeriodChange={(period) =>
            pushState(filters, metric, selectedCode, { layer: skyParams.layer, period })
          }
        />
      </div>
      <div className="pointer-events-auto">
        <FireControl
          value={fireWindow}
          onChange={(next) => pushState(filters, metric, selectedCode, skyParams, parcelId, next)}
        />
      </div>
      {canInspectParcels ? (
        <div className="pointer-events-auto">
          <FieldsControl
            checked={showFields}
            zoom={zoom}
            onChange={(next) =>
              pushState(filters, metric, selectedCode, skyParams, parcelId, fireWindow, next)
            }
          />
        </div>
      ) : null}
    </>
  );
  const legends = (
    <>
      {fireWindow ? <FireLegend window={fireWindow} data={fires} /> : null}
      {cropMap ? (
        <CropMapLegend />
      ) : sky ? (
        <SkyLegend
          view={sky}
          periodLabel={skyPeriodEntry?.label ?? sky.period}
          detail={canSeeSkyDetail}
        />
      ) : (
        <MapLegend metric={metric} breaks={breaks} showFarms={showFarms && canShowFarms} />
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 py-3 sm:px-6">
        <MapFiltersBar {...filterProps} />
      </div>
      {/* Rangée de hauteur bornée : la carte la remplit et le panneau défile seul. Sur téléphone,
          la carte laisse sous elle la place du tiroir replié. */}
      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative mb-[8.5rem] min-h-0 lg:mb-0">
          <MapCanvas
            statsByCode={stats.byCode}
            metric={metric}
            showFarms={showFarms && canShowFarms}
            selectedCommuneCode={selectedCode}
            onSelectCommune={(code) => {
              setSelectedCode(code);
              pushState(filters, metric, code);
            }}
            onHoverCommune={setHovered}
            sky={sky}
            skyDetail={canSeeSkyDetail}
            cropMap={cropMap}
            showParcels={canInspectParcels}
            selectedParcelId={parcelId}
            onSelectParcel={selectParcel}
            focusBounds={focusBounds}
            onZoomChange={setZoom}
            fires={fires}
            showFields={showFields}
            touchedFieldId={touchedFieldIds?.[0] ?? null}
            onSelectField={
              canAttributeFields && userId ? (id) => setTouchedFieldIds([id]) : undefined
            }
          />
          {canInspectParcels && zoom !== null && zoom < PARCEL_MIN_ZOOM - 3 ? (
            <p className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 rounded-full border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-raised sm:block">
              Rapprochez-vous d&apos;un village pour voir les champs
            </p>
          ) : null}
          {/* Grand écran : réglages et légende empilés sur la carte. Téléphone et tablette : un
              bouton « Couches » et une légende repliée, pour que la carte garde l'écran. */}
          {isWide ? (
            <div className="pointer-events-none absolute top-3 left-3 flex w-[240px] max-w-[calc(100%-4.5rem)] flex-col gap-2">
              {layerControls}
              {legends}
            </div>
          ) : isWide === false ? (
            <>
              <MapLayersSheet
                className="absolute top-3 left-3 z-10"
                activeCount={
                  (skyParams.layer ? 1 : 0) +
                  (fireWindow ? 1 : 0) +
                  (showFields ? 1 : 0) +
                  secondaryFiltersActive(filters, metric, showFarms)
                }
              >
                {layerControls}
                <div className="grid grid-cols-2 items-end gap-3 rounded-lg border bg-card p-3">
                  <MapSecondaryFilters {...filterProps} idPrefix="couches" />
                </div>
              </MapLayersSheet>
              <MapLegendToggle className="absolute bottom-3 left-3 z-10">{legends}</MapLegendToggle>
            </>
          ) : null}
          {hovered ? (
            <div
              className="pointer-events-none absolute z-10 rounded-md border bg-card px-3 py-2 text-xs shadow-raised"
              style={{ left: hovered.point.x + 12, top: hovered.point.y + 12 }}
              role="tooltip"
            >
              <p className="font-medium">{hovered.name}</p>
              <p className="tabular text-muted-foreground">
                {hoveredStats && !hoveredStats.masked && hoveredStats[metric] !== null
                  ? `${METRICS[metric].format(hoveredStats[metric])}${METRICS[metric].unit ? ` ${METRICS[metric].unit}` : ""}`
                  : hoveredStats?.masked
                    ? "Secret statistique (< 5 exploitations)"
                    : "Aucune exploitation"}
              </p>
            </div>
          ) : null}
        </div>
        {userId ? (
          <FieldAttributionSheet
            userId={userId}
            fieldIds={touchedFieldIds}
            onClose={() => setTouchedFieldIds(null)}
            onAttributed={(farmId) => {
              setTouchedFieldIds(null);
              if (farmHrefBase) router.push(`${farmHrefBase}/${farmId}` as Route);
            }}
          />
        ) : null}
        <MapPanelDrawer label="Lecture de la carte" expandKey={parcelId ?? selectedCode}>
          {parcelId ? (
            <ParcelPanel
              parcelId={parcelId}
              onClose={() => selectParcel(null)}
              onLoaded={(bbox) => {
                if (focusFromLink && bbox) setFocusBounds(bbox);
              }}
              farmHref={farmHrefBase ? (id) => `${farmHrefBase}/${id}` : undefined}
            />
          ) : (
            <MapSidePanel
              stats={stats}
              selected={selected}
              cropNames={cropNames}
              onClearSelection={() => {
                setSelectedCode(null);
                pushState(filters, metric, null);
              }}
            />
          )}
        </MapPanelDrawer>
      </div>
    </div>
  );
}
