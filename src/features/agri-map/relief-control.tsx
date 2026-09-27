"use client";

import { HelpTip } from "@/components/forms/help-tip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Relief 3D de la carte : le terrain se soulève et la vue s'incline. Il se coupe seul si
// l'affichage saccade, et l'avis le dit alors.
export function ReliefControl({
  checked,
  slowNotice,
  onChange,
}: {
  checked: boolean;
  slowNotice: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="relief-3d" className="text-xs font-medium">
            Relief 3D
          </Label>
          <HelpTip label="relief 3D">
            Soulève le terrain et incline la carte pour voir les pentes et les bas-fonds. Les
            élévations viennent de données publiques (SRTM), à environ 30 m de précision : elles
            montrent le relief d&apos;ensemble, pas chaque parcelle. Coupé automatiquement si
            l&apos;affichage devient lent.
          </HelpTip>
        </div>
        <Switch id="relief-3d" checked={checked} onCheckedChange={onChange} />
      </div>
      {slowNotice ? (
        <p role="status" className="text-muted-foreground">
          Relief coupé : l&apos;affichage était trop lent sur cet appareil.
        </p>
      ) : null}
    </div>
  );
}
