import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FieldGap } from "@/modules/reference-fields/gaps";
import { formatInteger } from "./dashboard-logic";

// Champs vus par le satellite qu'aucune parcelle enregistrée ne recouvre, par commune couverte :
// la liste de travail de l'agent pour trouver les exploitants manquants. « Apparus » compte ceux
// qui n'existaient pas à la détection précédente. Un lien ouvre la carte sur la commune, couche
// des champs détectés allumée.
export function FieldGapsSection({ gaps, year }: { gaps: readonly FieldGap[]; year: number }) {
  if (gaps.length === 0) {
    return (
      <p className="text-muted-foreground">
        Aucun champ détecté en {year} ne reste sans exploitation dans vos communes.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {gaps.map((gap) => (
        <li key={gap.communeCode} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{gap.communeName}</span>
            <span className="tabular text-sm text-muted-foreground">
              {formatInteger(gap.unregistered)} sur {formatInteger(gap.detected)} champs détectés
              sans exploitation
              {gap.appeared !== null
                ? `, dont ${formatInteger(gap.appeared)} apparus depuis ${year - 1}`
                : ""}
            </span>
          </div>
          <Button asChild variant="outline" className="h-11">
            <Link href={`/carte?champs=1&commune=${gap.communeCode}` as Route}>
              Voir sur la carte
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
