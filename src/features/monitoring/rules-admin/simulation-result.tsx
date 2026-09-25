import { StatTile } from "@/components/data-display/stat-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SimulationSummary } from "@/modules/monitoring/rule-admin/simulate";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function frDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T12:00:00Z`));
}

function trend(
  candidate: number,
  active: number,
): { value: number; label: string; positiveIsGood: boolean } | undefined {
  if (active === 0) return undefined;
  return {
    value: Math.round(((candidate - active) / active) * 1000) / 10,
    label: "par rapport à la version active",
    positiveIsGood: false,
  };
}

// Résultat d'une simulation (§2.C6) : alertes qui auraient été levées, communes et exploitations,
// comparaison avec la version active, jours non évaluables faute d'historique, communes aux
// données insuffisantes. Rien n'a été diffusé.
export function SimulationResult({ summary }: { summary: SimulationSummary }) {
  const period = `du ${frDate(summary.from)} au ${frDate(summary.to)}`;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="resultat-simulation">
      <h3 id="resultat-simulation" className="text-lg font-semibold">
        Simulation{" "}
        {summary.usesDraft ? "de la version modifiée" : `de la version ${summary.version}`},{" "}
        {period}
      </h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Alertes qui auraient été levées"
          value={summary.candidate.alerts}
          trend={
            summary.usesDraft ? trend(summary.candidate.alerts, summary.active.alerts) : undefined
          }
          source="Simulation sur les observations stockées"
          reliability="ESTIMATED"
        />
        <StatTile
          label="Communes concernées"
          value={summary.candidate.communes.length}
          source="Simulation"
          reliability="ESTIMATED"
        />
        <StatTile
          label="Exploitations touchées"
          value={summary.candidate.affectedFarms}
          source="Registre, cultures actuelles"
          reliability="ESTIMATED"
        />
      </div>
      {summary.usesDraft ? (
        <p className="text-sm text-muted-foreground">
          Version active sur la même période : {summary.active.alerts} alerte(s),{" "}
          {summary.active.communes.length} commune(s), {summary.active.affectedFarms}{" "}
          exploitation(s).
        </p>
      ) : null}
      {summary.unevaluated ? (
        <Alert variant="watch">
          <AlertTitle>
            {summary.evaluatedDays} jour(s) évalué(s) sur {summary.days}
          </AlertTitle>
          <AlertDescription>
            <p>
              Du {frDate(summary.unevaluated.from)} au {frDate(summary.unevaluated.to)}, aucune
              commune n&apos;avait assez d&apos;observations sur les 30 jours précédents
              {summary.historyStart
                ? ` (météo stockée depuis le ${frDate(summary.historyStart)})`
                : " (aucune météo stockée sur cette période)"}
              . Ces jours ne lèvent aucune alerte ; choisissez une période plus récente ou attendez
              que l&apos;historique s&apos;allonge.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {summary.insufficientData.length > 0 ? (
        <Alert variant="watch">
          <AlertTitle>
            Données insuffisantes pour {summary.insufficientData.length} commune(s)
          </AlertTitle>
          <AlertDescription>
            <p>
              Plus de 20 % de jours d&apos;observation manquants ou données anciennes :{" "}
              {summary.insufficientData
                .slice(0, 8)
                .map((c) => c.name)
                .join(", ")}
              {summary.insufficientData.length > 8 ? "…" : "."} Ces jours ne lèvent aucune alerte.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {summary.candidate.communes.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Commune</TableHead>
              <TableHead scope="col" className="text-right">
                Alertes
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.candidate.communes.slice(0, 20).map((commune) => (
              <TableRow key={commune.code}>
                <TableCell>{commune.name}</TableCell>
                <TableCell className="tabular text-right">{commune.alerts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune alerte n&apos;aurait été levée sur cette période.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {summary.evaluations} évaluations enregistrées pour la trace. Aucune alerte créée, aucun
        message envoyé.
      </p>
    </section>
  );
}
