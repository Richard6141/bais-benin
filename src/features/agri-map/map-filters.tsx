"use client";

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

// Quatre filtres au plus, tous optionnels : culture, campagne, département, statut de
// vérification. La métrique colorée change la lecture de la carte sans recharger les tuiles.
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
  const update = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
      <div className="col-span-2 flex items-end lg:col-span-1">
        <div className="flex h-11 items-center gap-3 md:h-9">
          <Switch
            id="filtre-exploitations"
            checked={showFarms}
            disabled={!canShowFarms}
            onCheckedChange={onShowFarmsChange}
          />
          <Label htmlFor="filtre-exploitations" className="font-normal">
            Exploitations
            {!canShowFarms ? (
              <span className="block text-xs text-muted-foreground">Zoomez pour les voir</span>
            ) : null}
          </Label>
        </div>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
