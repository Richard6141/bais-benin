"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FireWindowParam } from "@/features/agri-map/fire-layer";
import { useFires } from "@/features/agri-map/use-fires";
import { LiveActivityFeed } from "@/features/live/live-activity-feed";
import type { LiveActivityItem } from "@/modules/live";
import type { WatchSummary } from "@/modules/watch";
import {
  AlertsPanel,
  CropConditionPanel,
  ExposurePanel,
  FreshnessPanel,
  HeldOutbreaksPanel,
  Indicator,
  ReportGroupsPanel,
  formatClock,
} from "./watch-panels";

// Centre de veille (ADR-0022) : la synthèse est relue chaque minute et les feux toutes les cinq
// minutes, sans recharger la page. Carte au centre : communes colorées par l'alerte la plus grave,
// feux des dernières 24 heures ou des 7 derniers jours au-dessus. Les panneaux autour se replient.

const AlertMapCanvas = dynamic(
  () => import("@/features/monitoring/alert-map-canvas").then((module) => module.AlertMapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

const SUMMARY_REFRESH_MS = 60_000;
const FIRES_REFRESH_MS = 5 * 60_000;
const WINDOWS: ReadonlyArray<{ value: FireWindowParam; label: string }> = [
  { value: "24h", label: "24 heures" },
  { value: "7j", label: "7 jours" },
];

export function WatchCentre({ initial }: { initial: WatchSummary }) {
  const [summary, setSummary] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [window, setWindow] = useState<FireWindowParam>("24h");
  const fires = useFires(window, FIRES_REFRESH_MS);
  const [pulses, setPulses] = useState<LiveActivityItem[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/v1/veille", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<WatchSummary>;
        })
        .then((next) => {
          setSummary(next);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, SUMMARY_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {failed
          ? `Mise à jour impossible, données de ${formatClock(summary.generatedAt)}. Nouvel essai dans une minute.`
          : `Mis à jour à ${formatClock(summary.generatedAt)}, heure de Porto-Novo. Actualisation automatique chaque minute.`}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicator
          label="Feux, 24 heures"
          value={summary.fires.last24h}
          tone="alert"
          help={`Feux détectés au Bénin par les satellites de la NASA ces dernières 24 heures, dans ${summary.fires.communes} commune(s). ${summary.fires.last7d} sur 7 jours.`}
        />
        <Indicator
          label="Alertes actives"
          value={summary.alerts.active}
          tone="alert"
          help={`Dont ${summary.alerts.bySeverity.CRITICAL} critique(s) et ${summary.alerts.bySeverity.WARNING} avertissement(s).`}
        />
        <Indicator
          label="Foyers à confirmer"
          value={summary.heldOutbreaks.length}
          help="Foyers de signalements qui attendent la visite d'un agent avant d'être diffusés."
        />
        <Indicator
          label="Demandes reçues, 24 heures"
          value={summary.assistance.received24h}
          help={`${summary.assistance.received7d} sur 7 jours, ${summary.assistance.waiting} en attente de prise en charge, ${summary.assistance.resolved7d} résolues sur 7 jours. Volumes nationaux seulement.`}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <LiveActivityFeed onItems={setPulses} />
          <ExposurePanel summary={summary} window={window === "24h" ? "24h" : "7d"} />
          <CropConditionPanel summary={summary} />
          <FreshnessPanel summary={summary} />
        </div>
        {/* Sur téléphone, la carte passe en premier ; les panneaux suivent, repliables. */}
        <figure className="order-first flex min-w-0 flex-col gap-2 lg:order-none">
          <div
            role="group"
            aria-label="Période des feux affichés"
            className="flex items-center gap-2"
          >
            {WINDOWS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={window === option.value ? "default" : "outline"}
                aria-pressed={window === option.value}
                onClick={() => setWindow(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative h-[28rem] overflow-hidden rounded-lg border lg:h-[36rem]">
            <AlertMapCanvas levels={summary.levels} withFires fires={fires} pulses={pulses} />
          </div>
          <figcaption className="text-sm text-muted-foreground">
            Communes colorées par l&apos;alerte active la plus grave, feux en points colorés selon
            leur puissance. Source des feux : NASA FIRMS.
          </figcaption>
        </figure>
        <div className="flex flex-col gap-4">
          <AlertsPanel summary={summary} />
          <HeldOutbreaksPanel summary={summary} />
          <ReportGroupsPanel summary={summary} />
        </div>
      </div>
    </div>
  );
}
