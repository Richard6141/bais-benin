"use client";

import { HelpTip } from "@/components/data-display/help-tip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FIRE_CLASSES, type FireCollection, type FireWindowParam } from "./fire-layer";

const NONE = "aucun";

// Choix de la couche « Feux actifs » (ADR-0022) : aucune, 24 dernières heures ou 7 derniers
// jours, avec l'aide en infobulle.
export function FireControl({
  value,
  onChange,
}: {
  value: FireWindowParam | null;
  onChange: (value: FireWindowParam | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center gap-2">
        <Label htmlFor="feux-actifs" className="text-xs font-medium">
          Feux actifs
        </Label>
        <HelpTip label="feux actifs">
          Feux détectés par les satellites VIIRS (375 m) et MODIS de la NASA, mis à jour toutes les
          30 minutes. Un même feu vu par plusieurs satellites au même passage ne compte qu&apos;une
          fois.
        </HelpTip>
      </div>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : (next as FireWindowParam))}
      >
        <SelectTrigger id="feux-actifs" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Masqués</SelectItem>
          <SelectItem value="24h">Dernières 24 heures</SelectItem>
          <SelectItem value="7j">7 derniers jours</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// Légende des feux : intensité par puissance radiative, nombre de feux, source.
export function FireLegend({
  window,
  data,
}: {
  window: FireWindowParam;
  data: FireCollection | null;
}) {
  const count = data?.features.length ?? null;
  const period = window === "24h" ? "dernières 24 heures" : "7 derniers jours";
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs">
      <p className="flex items-center gap-2 font-medium">
        Feux actifs, {period}
        <HelpTip label="intensité des feux">
          La couleur suit la puissance radiative du feu, en mégawatts. Touchez un point pour voir
          l&apos;heure de détection (heure de Porto-Novo), les satellites et la confiance.
        </HelpTip>
      </p>
      <ul className="flex flex-col gap-1">
        {FIRE_CLASSES.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 rounded-full border border-white"
              style={{ background: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground" aria-live="polite">
        {count === null
          ? "Chargement des feux"
          : count === 0
            ? "Aucun feu détecté au Bénin sur cette période."
            : `${count.toLocaleString("fr-FR")} feu${count > 1 ? "x" : ""} détecté${count > 1 ? "s" : ""} au Bénin.`}
      </p>
      <p className="text-muted-foreground">Source : NASA FIRMS (VIIRS 375 m, MODIS)</p>
    </div>
  );
}
