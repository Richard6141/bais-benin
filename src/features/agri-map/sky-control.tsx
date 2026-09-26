"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImageryPeriod } from "@/modules/satellite";
import {
  CROP_MAP_LAYER,
  SKY_LAYERS,
  WORLDCEREAL_LAYER,
  type BaseLayer,
  type SkyLayer,
} from "./map-config";
import type { ImageryCatalogState } from "./use-imagery-catalog";

const COMMUNES = "communes";

interface SkyControlProps {
  catalog: ImageryCatalogState;
  layer: BaseLayer | null;
  period: string | null;
  onLayerChange: (layer: BaseLayer | null) => void;
  onPeriodChange: (period: string) => void;
}

/** Initiale en majuscule seulement : « Septembre 2026 », « 60 derniers jours ». */
function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function clearLabel(entry: ImageryPeriod): string {
  const scenes =
    entry.clearSceneCount === 0
      ? "très nuageux"
      : `${entry.clearSceneCount} scène${entry.clearSceneCount > 1 ? "s" : ""} dégagée${entry.clearSceneCount > 1 ? "s" : ""}`;
  if (entry.rolling) return `comblement des nuages (${scenes})`;
  return entry.current ? `en cours (${scenes})` : scenes;
}

// Choix du fond : la carte des communes, ou la vue du ciel Sentinel-2 (couleur naturelle ou
// indice de végétation) pour un mois. Le nombre de scènes dégagées de chaque mois aide à choisir
// une image lisible : en saison des pluies, le pays est souvent couvert.
export function SkyControl({
  catalog,
  layer,
  period,
  onLayerChange,
  onPeriodChange,
}: SkyControlProps) {
  const ready = catalog.status === "ready" ? catalog.catalog : null;
  const available = ready?.imageryAvailable ?? false;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vue-du-ciel" className="text-xs font-medium">
          Fond de carte
        </Label>
        <Select
          value={layer ?? COMMUNES}
          onValueChange={(value) => onLayerChange(value === COMMUNES ? null : (value as BaseLayer))}
        >
          <SelectTrigger
            id="vue-du-ciel"
            className="h-auto min-h-11 w-full text-left whitespace-normal *:data-[slot=select-value]:line-clamp-none md:min-h-9"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMMUNES}>Carte des communes</SelectItem>
            {(Object.keys(SKY_LAYERS) as SkyLayer[]).map((key) => (
              <SelectItem key={key} value={key} disabled={!available}>
                {SKY_LAYERS[key].label}
              </SelectItem>
            ))}
            {/* La carte des cultures ne dépend que de ses images calculées à l'avance. */}
            <SelectItem value={CROP_MAP_LAYER} disabled={catalog.status === "ready" && !available}>
              Carte des cultures
            </SelectItem>
            {/* Carte de référence en images statiques : toujours disponible. */}
            <SelectItem value={WORLDCEREAL_LAYER}>Terres cultivées 2021</SelectItem>
          </SelectContent>
        </Select>
        {catalog.status === "ready" && !available ? (
          <p className="text-muted-foreground">Images satellite en cours de mise en service.</p>
        ) : null}
        {catalog.status === "error" ? (
          <p className="text-muted-foreground">Catalogue satellite momentanément injoignable.</p>
        ) : null}
      </div>
      {layer && layer !== CROP_MAP_LAYER && layer !== WORLDCEREAL_LAYER && ready ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vue-du-ciel-periode" className="text-xs font-medium">
            Mois
          </Label>
          <Select value={period ?? undefined} onValueChange={onPeriodChange}>
            <SelectTrigger
              id="vue-du-ciel-periode"
              className="h-auto min-h-11 w-full text-left whitespace-normal *:data-[slot=select-value]:line-clamp-none md:min-h-9"
            >
              <SelectValue placeholder="Choisir un mois" />
            </SelectTrigger>
            <SelectContent>
              {ready.periods.map((entry) => (
                <SelectItem key={entry.period} value={entry.period}>
                  <span>{sentenceCase(entry.label)}</span>
                  {ready.partial ? null : (
                    <span className="text-muted-foreground">, {clearLabel(entry)}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
