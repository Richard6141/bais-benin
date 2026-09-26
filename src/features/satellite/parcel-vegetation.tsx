import { Satellite } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParcelVegetationCheck } from "@/modules/satellite";
import {
  VEGETATION_STATUS_LABELS,
  VEGETATION_STATUS_VARIANTS,
  formatNdvi,
  reasonLabel,
  vegetationSourceLabel,
} from "./vegetation-labels";

// Verdict satellite d'une parcelle sur la fiche exploitation de l'agent (ADR-0016) : statut,
// motif et valeurs comparées, avec la source. Un « à vérifier » invite à passer sur la parcelle.
export function ParcelVegetationNote({ checks }: { checks: readonly ParcelVegetationCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 border-t pt-2 text-sm" aria-label="Vue du satellite">
      {checks.map((check) => {
        const reason = reasonLabel(check.reason);
        return (
          <li key={`${check.campaignCode}-${check.subSeason}`} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Satellite className="size-4 text-muted-foreground" aria-hidden />
              <Badge variant={VEGETATION_STATUS_VARIANTS[check.status]}>
                {VEGETATION_STATUS_LABELS[check.status]}
              </Badge>
              <span className="text-muted-foreground">
                {check.cropName} · {check.campaignCode}
              </span>
            </span>
            {check.status === "TO_VERIFY" ? (
              <span>
                {reason ? `${reason} : ` : ""}NDVI observé{" "}
                <span className="tabular">{formatNdvi(check.peakNdvi)}</span>, attendu au moins{" "}
                <span className="tabular">{formatNdvi(check.expectedNdvi)}</span>. Une visite permet
                de confirmer la culture ou de corriger la déclaration.
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {vegetationSourceLabel(check.sourceId)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
