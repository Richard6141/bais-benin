"use client";

import { CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { cn } from "@/lib/utils";

export interface CropPickerOption {
  code: CropCode;
  nameFr: string;
  /** Culture dominante de la zone agro-écologique et de la sous-saison en cours. */
  suggested?: boolean;
}

interface CropPickerProps {
  id: string;
  crops: readonly CropPickerOption[];
  value: readonly string[];
  onChange: (codes: string[]) => void;
  max?: number;
  className?: string;
}

// Grille de pictogrammes plutôt qu'une liste déroulante : l'agriculteur reconnaît sa culture au
// dessin avant de lire son nom (docs/07 §6). Les cultures proposées pour la zone viennent en
// premier ; les autres restent accessibles, une association inhabituelle n'est jamais interdite.
export function CropPicker({ id, crops, value, onChange, max = 3, className }: CropPickerProps) {
  const ordered = [...crops].sort(
    (a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)),
  );
  const limitReached = value.length >= max;
  const hintId = `${id}-hint`;

  function toggle(code: string) {
    if (value.includes(code)) {
      onChange(value.filter((selected) => selected !== code));
    } else if (!limitReached) {
      onChange([...value, code]);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        id={id}
        role="group"
        aria-describedby={hintId}
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      >
        {ordered.map((crop) => {
          const selected = value.includes(crop.code);
          const disabled = !selected && limitReached;
          return (
            <button
              key={crop.code}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(crop.code)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border bg-card px-2 py-3 text-center text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-foreground hover:bg-accent/60",
              )}
            >
              <CropGlyph code={crop.code} size={48} className={selected ? "text-primary" : ""} />
              <span className="font-medium">{crop.nameFr}</span>
              {crop.suggested ? (
                <span className="text-xs text-muted-foreground">proposé pour votre zone</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p id={hintId} className="tabular text-sm text-muted-foreground" aria-live="polite">
        {value.length} sur {max} culture{max > 1 ? "s" : ""} choisie{value.length > 1 ? "s" : ""}
        {limitReached ? " : retirez-en une pour en choisir une autre" : ""}
      </p>
    </div>
  );
}
