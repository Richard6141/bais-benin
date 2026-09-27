"use client";

import { Flame } from "lucide-react";
import { useActionState } from "react";
import { HelpTip } from "@/components/forms/help-tip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestBurnAction, type BurnRequestState } from "./actions";

// Encart de la fiche d'exploitation (ADR-0038 §2) : après un feu proche, l'agent demande la
// mesure de la surface brûlée par satellite. Elle se fait 15 jours après le feu, puis une
// déclaration de sinistre arrive dans « Sinistres » si la surface brûlée le justifie.
export function BurnRequestPanel({ farmId }: { farmId: string }) {
  const [state, action, pending] = useActionState<BurnRequestState, FormData>(requestBurnAction, {
    status: "idle",
  });
  return (
    <Card role="region" aria-labelledby="feu-proche" className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Flame className="size-5 text-muted-foreground" aria-hidden />
        <h2 id="feu-proche" className="text-base font-semibold">
          Feu près de cette exploitation ?
        </h2>
        <HelpTip label="Surface brûlée par satellite">
          Seules les parcelles au contour relevé, à moins de 500 m d&apos;un feu détecté ces 30
          derniers jours, sont mesurées. L&apos;image d&apos;avant le feu est comparée à celle
          d&apos;après (Sentinel-2), 15 jours après le feu. C&apos;est une estimation, à confirmer
          sur place.
        </HelpTip>
      </div>
      <form action={action}>
        <input type="hidden" name="farmId" value={farmId} />
        <Button type="submit" variant="outline" className="h-11" disabled={pending}>
          Estimer la surface brûlée
        </Button>
      </form>
      {state.status === "queued" ? (
        <p role="status" className="text-sm">
          {state.parcels > 0
            ? `${state.parcels} parcelle${state.parcels > 1 ? "s" : ""} en mesure : la surface brûlée sera estimée 15 jours après le feu.`
            : "Aucune parcelle au contour relevé n'est à moins de 500 m d'un feu de ces 30 derniers jours, ou la mesure est déjà demandée."}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </Card>
  );
}
