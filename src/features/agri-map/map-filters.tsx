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

/** Filtres secondaires actifs (hors valeur par défaut) : compte affiché sur le bouton Couches. */
export function secondaryFiltersActive(
  filters: MapFilters,
  metric: MetricKey,
  showFarms: boolean,
): number {
  return (filters.campaignCode ? 1 : 0) + (metric !== "farmCount" ? 1 : 0) + (showFarms ? 1 : 0);
}

// Une seule ligne de filtres sur grand écran : culture, département, campagne, couleur des
// communes, et l'interrupteur des exploitations pour les comptes qui y ont droit (jamais grisé :
// absent pour les autres). Sur téléphone, culture et département restent seuls au-dessus de la
// carte ; les filtres secondaires passent dans la feuille « Couches » (map-layers-sheet.tsx).
export function MapFiltersBar(props: MapFiltersProps) {
  const { options, filters, onChange } = props;
  const update = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
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
      <div className="hidden lg:contents">
        <MapSecondaryFilters {...props} idPrefix="filtre" />
      </div>
    </div>
  );
}

/**
 * Campagne, couleur des communes et interrupteur des exploitations : dans la ligne de filtres sur
 * grand écran, dans la feuille « Couches » sur téléphone (préfixe d'identifiant distinct).
 */
export function MapSecondaryFilters({
  options,
  filters,
  metric,
  showFarms,
  canShowFarms,
  onChange,
  onMetricChange,
  onShowFarmsChange,
  idPrefix,
}: MapFiltersProps & { idPrefix: string }) {
  const update = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });
  return (
    <>
      <Field label="Campagne" id={`${idPrefix}-campagne`}>
        <Select
          value={filters.campaignCode ?? ALL}
          onValueChange={(value) => update({ campaignCode: value === ALL ? undefined : value })}
        >
          <SelectTrigger id={`${idPrefix}-campagne`} className="w-full">
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
      <Field label="Couleur des communes" id={`${idPrefix}-metrique`}>
        <Select value={metric} onValueChange={(value) => onMetricChange(value as MetricKey)}>
          <SelectTrigger id={`${idPrefix}-metrique`} className="w-full">
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
            id={`${idPrefix}-exploitations`}
            checked={showFarms}
            onCheckedChange={onShowFarmsChange}
          />
          <Label htmlFor={`${idPrefix}-exploitations`} className="font-normal">
            Exploitations
          </Label>
          <HelpTip label="Exploitations">
            Les exploitations de votre périmètre, en points sur la carte.
          </HelpTip>
        </div>
      ) : null}
    </>
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
