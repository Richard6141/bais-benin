"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";

// Réservé à l'agent : par défaut un toucher attribue le champ. En mode « plusieurs champs », les
// touchers s'additionnent (champs voisins d'une même exploitation) puis un seul geste les attribue.
export function FieldMultiBar({
  multiple,
  count,
  onToggle,
  onAttribute,
  onClear,
}: {
  multiple: boolean;
  count: number;
  onToggle: (value: boolean) => void;
  onAttribute: () => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute bottom-24 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border bg-card/95 p-2 shadow-raised md:bottom-8">
      <Button
        type="button"
        variant={multiple ? "default" : "outline"}
        className="h-11"
        aria-pressed={multiple}
        onClick={() => onToggle(!multiple)}
      >
        Plusieurs champs
      </Button>
      <HelpTip label="plusieurs champs">
        Touchez chaque champ voisin de la même exploitation, puis attribuez-les d&apos;un seul geste
        : leurs contours sont réunis en une parcelle. Touchez un champ choisi pour le retirer.
      </HelpTip>
      {multiple && count > 0 ? (
        <>
          <Button type="button" className="h-11" onClick={onAttribute}>
            Attribuer {count} {count > 1 ? "champs" : "champ"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onClear}>
            Effacer
          </Button>
        </>
      ) : null}
    </div>
  );
}
