"use client";

import type { Route } from "next";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { HoveredCommune } from "./map-canvas";
import { METRICS, quantileBreaks, type MetricKey } from "./map-config";
import { MapFiltersBar, type FilterOptions } from "./map-filters";
import { MapLegend } from "./map-legend";
import { MapSidePanel } from "./map-side-panel";
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
}

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

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
export function AgriMap({ options, canShowFarms, canFilterByStatus }: AgriMapProps) {
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
  const [showFarms, setShowFarms] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(searchParams.get("commune"));
  const [hovered, setHovered] = useState<HoveredCommune | null>(null);

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
    (nextFilters: MapFilters, nextMetric: MetricKey, nextCommune: string | null) => {
      const params = filtersToSearchParams(nextFilters);
      if (nextMetric !== "farmCount") params.set("metric", nextMetric);
      if (nextCommune) params.set("commune", nextCommune);
      const query = params.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    },
    [router, pathname],
  );

  const hoveredStats = hovered ? stats.byCode.get(hovered.code) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 py-3 sm:px-6">
        <MapFiltersBar
          options={options}
          filters={filters}
          metric={metric}
          showFarms={showFarms}
          canShowFarms={canShowFarms}
          onChange={(next) => {
            setSelectedCode(null);
            pushState(next, metric, null);
          }}
          onMetricChange={(next) => pushState(filters, next, selectedCode)}
          onShowFarmsChange={setShowFarms}
        />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[60vh] lg:min-h-0">
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
          />
          <div className="pointer-events-none absolute top-3 left-3 max-w-[220px]">
            <MapLegend metric={metric} breaks={breaks} showFarms={showFarms && canShowFarms} />
          </div>
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
        <aside
          className="border-t bg-background p-4 lg:border-t-0 lg:border-l"
          aria-label="Lecture de la carte"
        >
          <MapSidePanel
            stats={stats}
            selected={selected}
            cropNames={cropNames}
            onClearSelection={() => {
              setSelectedCode(null);
              pushState(filters, metric, null);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
