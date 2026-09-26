"use client";

import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFires } from "@/features/agri-map/use-fires";
import { LiveActivityFeed } from "@/features/live/live-activity-feed";
import type { LiveActivityItem } from "@/modules/live";
import type { WatchSummary } from "@/modules/watch";

// Salle de situation (plan d'action, chantier H) : la veille nationale en plein écran, pour un mur
// d'écrans ou un vidéoprojecteur. Carte au centre avec les feux et les faits qui arrivent en
// direct, quatre chiffres lisibles de loin, le fil d'activité, et un bandeau qui fait défiler les
// faits marquants. Tout se met à jour seul : personne n'a à toucher l'écran.

const AlertMapCanvas = dynamic(
  () => import("@/features/monitoring/alert-map-canvas").then((module) => module.AlertMapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

const SUMMARY_REFRESH_MS = 60_000;
const FIRES_REFRESH_MS = 5 * 60_000;
const HIGHLIGHT_MS = 8_000;

const clock = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});
const today = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Africa/Porto-Novo",
});
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("fr-FR");

function plural(count: number, one: string, many: string): string {
  return `${integer.format(count)} ${count > 1 ? many : one}`;
}

/** Phrases du bandeau, tirées de la synthèse : ce qu'un décideur doit lire en passant. */
export function highlights(summary: WatchSummary): string[] {
  const lines: string[] = [];
  const { alerts, fires, heldOutbreaks, assistance, cropCondition, exposure } = summary;
  if (alerts.active > 0) {
    const critical = alerts.bySeverity.CRITICAL;
    lines.push(
      `${plural(alerts.active, "alerte active", "alertes actives")}${critical > 0 ? `, dont ${plural(critical, "critique", "critiques")}` : ""}`,
    );
  }
  for (const alert of alerts.items.slice(0, 3)) lines.push(`${alert.title} à ${alert.communeName}`);
  if (fires.last24h > 0) {
    lines.push(
      `${plural(fires.last24h, "feu détecté", "feux détectés")} en 24 heures, dans ${plural(fires.communes, "commune", "communes")}`,
    );
  }
  for (const row of exposure["24h"].slice(0, 2)) {
    lines.push(
      `Feux près des parcelles à ${row.commune_name} : ${plural(row.producers, "producteur exposé", "producteurs exposés")}`,
    );
  }
  if (heldOutbreaks.length > 0) {
    lines.push(
      `${plural(heldOutbreaks.length, "foyer de signalements", "foyers de signalements")} à confirmer sur le terrain`,
    );
  }
  for (const crop of cropCondition?.worst.slice(0, 2) ?? []) {
    lines.push(
      `${crop.name} : ${percent.format(crop.poorShare)} de la surface observée en état faible`,
    );
  }
  if (assistance.waiting > 0) {
    lines.push(
      `${plural(assistance.waiting, "demande d'aide", "demandes d'aide")} en attente de prise en charge`,
    );
  }
  return lines.length > 0 ? lines : ["Aucun fait marquant : la situation est calme."];
}

function BigFigure({ label, value, tone }: { label: string; value: number; tone?: "alert" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular text-5xl leading-none font-bold ${tone === "alert" && value > 0 ? "text-laterite" : ""}`}
      >
        {integer.format(value)}
      </span>
    </div>
  );
}

export function SituationRoom({ initial }: { initial: WatchSummary }) {
  const [summary, setSummary] = useState(initial);
  const [now, setNow] = useState(() => new Date());
  const [pulses, setPulses] = useState<LiveActivityItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const fires = useFires("24h", FIRES_REFRESH_MS);
  const lines = useMemo(() => highlights(summary), [summary]);

  useEffect(() => {
    const refresh = setInterval(() => {
      fetch("/api/v1/veille", { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<WatchSummary>) : null))
        .then((next) => {
          if (next) setSummary(next);
        })
        .catch(() => undefined);
    }, SUMMARY_REFRESH_MS);
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const rotate = setInterval(() => setHighlightIndex((index) => index + 1), HIGHLIGHT_MS);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, []);

  const highlight = lines[highlightIndex % lines.length];

  return (
    <div className="dark flex h-dvh flex-col gap-3 bg-background p-3 text-foreground lg:p-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Ministère de l&apos;Agriculture, de l&apos;Élevage et de la Pêche
          </span>
          <h1 className="text-2xl font-bold">Salle de situation</h1>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="tabular text-3xl leading-none font-bold">{clock.format(now)}</p>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {today.format(now)}
            </p>
          </div>
          <Link
            href={"/pilotage/veille" as Route}
            className="flex size-11 items-center justify-center rounded-md border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Quitter la salle de situation"
          >
            <Minimize2 className="size-5" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="relative min-h-[50vh] overflow-hidden rounded-lg border lg:min-h-0">
          <AlertMapCanvas levels={summary.levels} withFires fires={fires} pulses={pulses} />
        </div>
        <aside className="flex min-h-0 flex-col gap-3" aria-label="Chiffres et activité">
          <div className="grid grid-cols-2 gap-3">
            <BigFigure label="Feux, 24 heures" value={summary.fires.last24h} tone="alert" />
            <BigFigure label="Alertes actives" value={summary.alerts.active} tone="alert" />
            <BigFigure label="Foyers à confirmer" value={summary.heldOutbreaks.length} />
            <BigFigure label="Demandes, 24 heures" value={summary.assistance.received24h} />
          </div>
          <LiveActivityFeed
            className="min-h-0 flex-1 overflow-y-auto"
            onItems={setPulses}
            maxItems={10}
          />
        </aside>
      </div>

      <footer
        className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
        aria-live="polite"
      >
        <span className="shrink-0 rounded-sm bg-laterite px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
          À retenir
        </span>
        <p key={highlight} className="animate-in text-lg font-medium fade-in-0">
          {highlight}
        </p>
      </footer>
    </div>
  );
}
