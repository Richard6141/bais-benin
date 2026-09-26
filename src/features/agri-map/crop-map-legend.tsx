"use client";

import { useEffect, useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { CROP_MAP_CLASSES, CROP_MAP_QUARTERS, cropMapAttribution } from "./map-config";

/** Quarts de la carte déjà calculés : une image absente répond 204. */
function useReadyQuarters(): number | null {
  const [ready, setReady] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      CROP_MAP_QUARTERS.map((quarter) =>
        fetch(quarter.url)
          .then((response) => response.status === 200)
          .catch(() => false),
      ),
    ).then((flags) => {
      if (!cancelled) setReady(flags.filter(Boolean).length);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

// Légende de la carte des cultures (ADR-0021) : les classes que le satellite distingue, et
// l'avertissement qui accompagne toute surface qui en découle. La carte est calculée une fois par
// mois : tant qu'elle ne l'est pas, la légende le dit au lieu de laisser un fond vide.
export function CropMapLegend() {
  const ready = useReadyQuarters();
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center gap-1">
        <p className="font-medium">Carte des cultures</p>
        <HelpTip label="Carte des cultures">
          Chaque pixel d&apos;environ 400 m est classé d&apos;après la courbe de végétation de ses
          12 derniers mois, vue par Sentinel-2 : levée et pic de la saison des pluies, verdure en
          saison sèche, submersion des rizières. Une parcelle isolée plus petite qu&apos;un pixel
          n&apos;apparaît pas. Les agents confirment sur le terrain.
        </HelpTip>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {CROP_MAP_CLASSES.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              className="size-3.5 shrink-0 rounded-sm border border-black/10"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.label}</span>
          </li>
        ))}
      </ul>
      {ready === 0 ? (
        <p className="mt-2 font-medium">Carte en préparation</p>
      ) : ready !== null && ready < CROP_MAP_QUARTERS.length ? (
        <p className="mt-2 font-medium">Carte en partie prête</p>
      ) : null}
      <p className="mt-2 font-medium text-warning">En cours de calibrage, à ne pas citer</p>
      <p className="mt-1 font-medium text-warning">Estimation satellite, à confirmer</p>
      <p className="mt-1 text-muted-foreground">Sentinel-2, 12 derniers mois</p>
      <p className="mt-1 text-muted-foreground">{cropMapAttribution()}</p>
    </div>
  );
}
