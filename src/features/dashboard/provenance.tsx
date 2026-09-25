import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { MaskedValue } from "@/components/data-display/masked-value";
import type { Reliability } from "@/components/data-display/reliability-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AnalyticsProvenance } from "@/modules/analytics";

// Provenance des chiffres du tableau de bord : chaque tuile, tableau et graphique dit d'où vient
// la donnée, de quand elle date et quelle est sa fiabilité (docs/01, principe 2).

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});
const dateOnly = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

export function formatDataDate(date: Date | null | undefined): string {
  return date ? dateTime.format(date) : "date inconnue";
}

export function formatShortDate(date: Date | null | undefined): string {
  return date ? dateOnly.format(date) : "—";
}

/** Propriétés de provenance d'une StatTile. */
export function tileProvenance(provenance: AnalyticsProvenance, source = "Registre BAIS") {
  const date = provenance.refreshedAt ?? provenance.generatedAt;
  const reliability: Reliability = provenance.synthetic ? "SYNTHETIC" : provenance.reliability;
  return { source, sourceDate: formatShortDate(date), reliability };
}

/** Valeur d'une tuile : « moins de 5 » expliqué si la ligne est masquée, tiret si absente. */
export function tileValue(
  value: number | null | undefined,
  masked: boolean,
  format: (value: number) => string = String,
  empty = "—",
): ReactNode {
  if (masked) return <MaskedValue />;
  return typeof value === "number" ? format(value) : empty;
}

/** Bandeau tant que le registre est surtout synthétique : un chiffre de démonstration ne se cite pas. */
export function DemoDataBanner({ provenance }: { provenance: AnalyticsProvenance }) {
  if (!provenance.synthetic) return null;
  return (
    <Alert variant="info">
      <Info aria-hidden />
      <AlertTitle>Données de démonstration</AlertTitle>
      <AlertDescription>
        <p>
          Le registre affiché est synthétique : les chiffres illustrent le fonctionnement du tableau
          de bord et ne décrivent pas l&apos;agriculture béninoise.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Pied de provenance commun aux sections et à la fiche imprimable. */
export function ProvenanceNote({ provenance }: { provenance: AnalyticsProvenance }) {
  return (
    <p className="text-xs text-muted-foreground">
      Source : registre BAIS, agrégats du {formatDataDate(provenance.refreshedAt)}.{" "}
      {provenance.verifiedShare === null
        ? ""
        : `Part d'exploitations vérifiées : ${Math.round(provenance.verifiedShare * 100)} %. `}
      Les cellules « moins de 5 » relèvent du secret statistique et ne sont pas exportées.
    </p>
  );
}
