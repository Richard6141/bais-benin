"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { CROP_MAP_CLASSES, cropMapAttribution } from "./map-config";

// Légende de la carte des cultures (ADR-0021) : les classes que le satellite distingue, et
// l'avertissement qui accompagne toute surface qui en découle.
export function CropMapLegend() {
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
      <p className="mt-2 font-medium text-warning">Estimation satellite, à confirmer</p>
      <p className="mt-1 text-muted-foreground">Sentinel-2, 12 derniers mois</p>
      <p className="mt-1 text-muted-foreground">{cropMapAttribution()}</p>
    </div>
  );
}
