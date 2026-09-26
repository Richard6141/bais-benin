"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";

export type FieldMode = "single" | "multiple" | "split";

// Réservé à l'agent. Par défaut un toucher attribue le champ. « Plusieurs champs » additionne des
// champs voisins d'une même exploitation, « Diviser » coupe un champ entre deux producteurs par
// deux touchers qui tracent la ligne de coupe.
export function FieldMultiBar({
  mode,
  count,
  cutPoints,
  onMode,
  onAttribute,
  onClear,
}: {
  mode: FieldMode;
  count: number;
  cutPoints: number;
  onMode: (mode: FieldMode) => void;
  onAttribute: () => void;
  onClear: () => void;
}) {
  const toggle = (target: Exclude<FieldMode, "single">) =>
    onMode(mode === target ? "single" : target);
  return (
    <div className="absolute bottom-24 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border bg-card/95 p-2 shadow-raised md:bottom-8">
      <Button
        type="button"
        variant={mode === "multiple" ? "default" : "outline"}
        className="h-11"
        aria-pressed={mode === "multiple"}
        onClick={() => toggle("multiple")}
      >
        Plusieurs champs
      </Button>
      <Button
        type="button"
        variant={mode === "split" ? "default" : "outline"}
        className="h-11"
        aria-pressed={mode === "split"}
        onClick={() => toggle("split")}
      >
        Diviser un champ
      </Button>
      <HelpTip label="sélection des champs">
        Plusieurs champs : touchez chaque champ voisin d&apos;une même exploitation, puis
        attribuez-les d&apos;un geste, leurs contours sont réunis. Diviser un champ : touchez deux
        points du même champ, la ligne qui les joint le coupe en deux parts, à attribuer chacune à
        son producteur.
      </HelpTip>
      {mode === "multiple" && count > 0 ? (
        <>
          <Button type="button" className="h-11" onClick={onAttribute}>
            Attribuer {count} {count > 1 ? "champs" : "champ"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onClear}>
            Effacer
          </Button>
        </>
      ) : null}
      {mode === "split" ? (
        <span role="status" className="px-1 text-sm">
          {cutPoints === 0
            ? "Touchez le premier point de coupe"
            : "Touchez le second point de coupe"}
        </span>
      ) : null}
    </div>
  );
}
