"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ImageryPeriod } from "@/modules/satellite";
import {
  CROP_MAP_LAYER,
  ROLLING_SKY_PERIOD,
  SKY_LAYERS,
  WORLDCEREAL_LAYER,
  type BaseLayer,
  type SkyLayer,
} from "./map-config";
import { defaultBeforePeriod, monthTimeline } from "./sky-time";
import type { ImageryCatalogState } from "./use-imagery-catalog";

const COMMUNES = "communes";

const WRAP =
  "h-auto min-h-11 w-full text-left whitespace-normal *:data-[slot=select-value]:line-clamp-none md:min-h-9";

interface SkyControlProps {
  catalog: ImageryCatalogState;
  layer: BaseLayer | null;
  period: string | null;
  onLayerChange: (layer: BaseLayer | null) => void;
  onPeriodChange: (period: string) => void;
  /** Comparaison avant et après : mois « avant » choisi, ou null quand elle est éteinte. */
  before?: string | null;
  onBeforeChange?: (period: string | null) => void;
  /** Faux sur un appareil modeste : la comparaison superpose une seconde carte. */
  compareAvailable?: boolean;
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
  before = null,
  onBeforeChange,
  compareAvailable = false,
}: SkyControlProps) {
  const ready = catalog.status === "ready" ? catalog.catalog : null;
  const selectedPeriod = ready?.periods.find((entry) => entry.period === period) ?? null;
  const available = ready?.imageryAvailable ?? false;
  const timeline = ready ? monthTimeline(ready.periods) : [];
  const timelineIndex = timeline.findIndex((entry) => entry.period === period);
  const comparing = before !== null;
  const currentIsRolling = period === ROLLING_SKY_PERIOD;
  const defaultBefore = defaultBeforePeriod(timeline, period, currentIsRolling);
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
          <SelectTrigger id="vue-du-ciel" className={WRAP}>
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
            <SelectTrigger id="vue-du-ciel-periode" className="w-full">
              {/* Le champ ne montre que le mois ; le nombre de scènes dégagées reste dans la
                  liste, où il aide à choisir. Tout afficher coupait ou débordait du champ. */}
              <SelectValue placeholder="Choisir un mois">
                {selectedPeriod ? sentenceCase(selectedPeriod.label) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ready.periods.map((entry) => (
                <SelectItem key={entry.period} value={entry.period}>
                  <span>
                    {sentenceCase(entry.label)}
                    {ready.partial ? null : (
                      <span className="text-muted-foreground">, {clearLabel(entry)}</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {timeline.length > 1 ? (
            <input
              type="range"
              min={0}
              max={timeline.length - 1}
              step={1}
              value={Math.max(timelineIndex, 0)}
              onChange={(event) => {
                const next = timeline[Number(event.target.value)];
                if (next) onPeriodChange(next.period);
              }}
              aria-label="Faire défiler les mois"
              aria-valuetext={sentenceCase(timeline[Math.max(timelineIndex, 0)]?.label ?? "")}
              className="h-11 w-full accent-primary md:h-6"
            />
          ) : null}
        </div>
      ) : null}
      {compareAvailable &&
      onBeforeChange &&
      layer &&
      layer !== CROP_MAP_LAYER &&
      layer !== WORLDCEREAL_LAYER &&
      timeline.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="comparer-ciel" className="text-xs font-medium">
                Comparer avec un autre mois
              </Label>
              <HelpTip label="comparer deux mois">
                Un rideau partage l&apos;écran : à gauche le mois choisi ici, à droite le mois
                affiché. Glissez le curseur du bas pour déplacer le rideau et voir ce qui a changé.
              </HelpTip>
            </div>
            <Switch
              id="comparer-ciel"
              checked={comparing}
              onCheckedChange={(on) => onBeforeChange(on ? defaultBefore : null)}
              disabled={defaultBefore === null && !comparing}
            />
          </div>
          {comparing ? (
            <Select value={before ?? undefined} onValueChange={onBeforeChange}>
              <SelectTrigger id="avant-ciel" aria-label="Mois avant" className={WRAP}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeline
                  .filter((entry) => entry.period !== period)
                  .map((entry) => (
                    <SelectItem key={entry.period} value={entry.period}>
                      {sentenceCase(entry.label)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
