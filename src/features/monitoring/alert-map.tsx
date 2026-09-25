"use client";

import dynamic from "next/dynamic";
import { SEVERITY_LABELS } from "@/components/data-display/severity-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SEVERITY_COLORS } from "./alert-map-colors";
import type { Severity } from "./monitoring-logic";

// MapLibre manipule window et WebGL : chargé côté client uniquement.
const AlertMapCanvas = dynamic(
  () => import("./alert-map-canvas").then((module) => module.AlertMapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

interface AlertMapProps {
  levels: readonly { communeCode: string; severity: Severity; count: number }[];
  communeNames: Readonly<Record<string, string>>;
}

// Carte du centre d'alertes : communes colorées par la sévérité maximale active, légende
// textuelle et liste accessible des communes (la carte seule ne suffit pas au lecteur d'écran).
export function AlertMap({ levels, communeNames }: AlertMapProps) {
  const used = (["CRITICAL", "WARNING", "WATCH", "INFO"] as const).filter((severity) =>
    levels.some((level) => level.severity === severity),
  );
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="relative h-80 overflow-hidden rounded-xl border sm:h-[28rem]">
        <AlertMapCanvas levels={levels} />
      </div>
      <figcaption className="flex flex-col gap-2 text-sm">
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Légende">
          {used.map((severity) => (
            <li key={severity} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-3 rounded-sm"
                style={{ background: SEVERITY_COLORS[severity] }}
              />
              {SEVERITY_LABELS[severity]}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm border bg-[#f1ede6]" />
            Sans alerte active
          </li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {levels.length} commune{levels.length > 1 ? "s" : ""} en alerte
          </span>
          {levels.length > 0
            ? ` : ${levels.map((level) => `${communeNames[level.communeCode] ?? level.communeCode} (${SEVERITY_LABELS[level.severity].toLowerCase()})`).join(", ")}.`
            : "."}
        </p>
      </figcaption>
    </figure>
  );
}
