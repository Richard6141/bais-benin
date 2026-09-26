"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FIELD_MIN_ZOOM } from "./map-config";

// Couche « Champs détectés » (ADR-0029) : contours de champs issus de Fields of The World, sans
// exploitant. Affichée seulement aux comptes qui lisent le registre ; les champs apparaissent à
// partir du zoom 12, l'invite dit de se rapprocher en dessous.
export function FieldsControl({
  checked,
  zoom,
  onChange,
}: {
  checked: boolean;
  zoom: number | null;
  onChange: (value: boolean) => void;
}) {
  const tooFar = checked && zoom !== null && zoom < FIELD_MIN_ZOOM;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="champs-detectes" className="text-xs font-medium">
            Champs détectés
          </Label>
          <HelpTip label="champs détectés">
            Contours de champs délimités par un modèle à partir des images Sentinel-2 (Fields of The
            World, 10 m). Ce ne sont pas des parcelles enregistrées : ils n&apos;ont ni exploitant
            ni culture. En trait plein, les champs qu&apos;aucune parcelle enregistrée ne recouvre.
          </HelpTip>
        </div>
        <Switch id="champs-detectes" checked={checked} onCheckedChange={onChange} />
      </div>
      {tooFar ? <p className="text-muted-foreground">Rapprochez-vous pour les voir.</p> : null}
    </div>
  );
}
