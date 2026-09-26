"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MetricKey } from "./map-config";
import { METRICS } from "./map-config";
import type { MapFilters } from "./use-territory-stats";

export interface FilterOptions {
  crops: { code: string; nameFr: string }[];
  campaigns: { code: string }[];
  departements: { code: string; name: string }[];
}

interface MapFiltersProps {
  options: FilterOptions;
  filters: MapFilters;
  metric: MetricKey;
  showFarms: boolean;
  canShowFarms: boolean;
  onChange: (filters: MapFilters) => void;
  onMetricChange: (metric: MetricKey) => void;
  onShowFarmsChange: (value: boolean) => void;
}

const ALL = "__all__";

// Une seule ligne de filtres sur grand écran : culture, département, campagne, couleur des
// communes, et l'interrupteur des exploitations pour les comptes qui y ont droit (jamais grisé :
// absent pour les autres). Sur téléphone, culture et département restent visibles, le reste passe
// derrière « Plus de filtres » pour laisser la place à la carte.
export function MapFiltersBar({
  options,
  filters,
  metric,
  showFarms,
  canShowFarms,
  onChange,
  onMetricChange,
  onShowFarmsChange,
}: MapFiltersProps) {
  const [more, setMore] = useState(false);
  const update = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });
  const hiddenActive =
    (filters.campaignCode ? 1 : 0) + (metric !== "farmCount" ? 1 : 0) + (showFarms ? 1 : 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <Field label="Culture" id="filtre-culture">
        <Select
          value={filters.cropCode ?? ALL}
          onValueChange={(value) => update({ cropCode: value === ALL ? undefined : value })}
        >
          <SelectTrigger id="filtre-culture" className="w-full">
            <SelectValue placeholder="Toutes les cultures" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les cultures</SelectItem>
            {options.crops.map((crop) => (
              <SelectItem key={crop.code} value={crop.code}>
                {crop.nameFr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Département" id="filtre-departement">
        <Select
          value={filters.departementCode ?? ALL}
          onValueChange={(value) => update({ departementCode: value === ALL ? undefined : value })}
        >
          <SelectTrigger id="filtre-departement" className="w-full">
            <SelectValue placeholder="Tout le pays" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tout le pays</SelectItem>
            {options.departements.map((departement) => (
              <SelectItem key={departement.code} value={departement.code}>
                {departement.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative lg:hidden"
        aria-expanded={more}
        aria-controls="filtres-supplementaires"
        aria-label={more ? "Moins de filtres" : "Plus de filtres"}
        onClick={() => setMore((value) => !value)}
      >
        <SlidersHorizontal aria-hidden />
        {hiddenActive > 0 ? (
          <span className="tabular absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {hiddenActive}
          </span>
        ) : null}
      </Button>
      <div
        id="filtres-supplementaires"
        className={`${more ? "grid" : "hidden"} col-span-3 grid-cols-2 items-end gap-3 lg:contents`}
      >
        <Field label="Campagne" id="filtre-campagne">
          <Select
            value={filters.campaignCode ?? ALL}
            onValueChange={(value) => update({ campaignCode: value === ALL ? undefined : value })}
          >
            <SelectTrigger id="filtre-campagne" className="w-full">
              <SelectValue placeholder="Toutes les campagnes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les campagnes</SelectItem>
              {options.campaigns.map((campaign) => (
                <SelectItem key={campaign.code} value={campaign.code}>
                  {campaign.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Couleur des communes" id="filtre-metrique">
          <Select value={metric} onValueChange={(value) => onMetricChange(value as MetricKey)}>
            <SelectTrigger id="filtre-metrique" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METRICS) as MetricKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {METRICS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {canShowFarms ? (
          <div className="col-span-2 flex h-11 items-center gap-3 md:h-9 lg:col-span-1">
            <Switch
              id="filtre-exploitations"
              checked={showFarms}
              onCheckedChange={onShowFarmsChange}
            />
            <Label htmlFor="filtre-exploitations" className="font-normal">
              Exploitations
            </Label>
            <HelpTip label="Exploitations">
              Les exploitations de votre périmètre, en points sur la carte.
            </HelpTip>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
