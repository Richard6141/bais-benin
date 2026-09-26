import { MASKED_VALUE_LABEL } from "@/components/data-display/masked-labels";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssistanceStats } from "@/modules/assistance";

const integer = new Intl.NumberFormat("fr-FR");
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Délai lisible : en heures sous deux jours, en jours au-delà. */
export function formatDelay(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${decimal.format(hours)} h` : `${decimal.format(hours / 24)} j`;
}

// Volumes et délais des demandes d'assistance par commune (ministère). Une commune de moins de
// 5 demandes est masquée, comme toute case du tableau de bord.
export function AssistanceStatsTable({ stats }: { stats: AssistanceStats }) {
  if (stats.communes.length === 0) {
    return (
      <p className="text-muted-foreground">Aucune demande reçue ces {stats.days} derniers jours.</p>
    );
  }
  return (
    <Table>
      <TableCaption>
        {integer.format(stats.total.requests)} demandes reçues ces {stats.days} derniers jours, dont{" "}
        {integer.format(stats.total.resolved)} résolues. Délais médians comptés depuis la réception
        de la demande. Une commune de moins de 5 demandes est masquée (secret statistique).
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Commune</TableHead>
          <TableHead className="text-right">Demandes</TableHead>
          <TableHead className="text-right">En attente</TableHead>
          <TableHead className="text-right">En cours</TableHead>
          <TableHead className="text-right">Résolues</TableHead>
          <TableHead className="text-right">Prise en charge</TableHead>
          <TableHead className="text-right">Résolution</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.communes.map((row) => (
          <TableRow key={row.communeCode}>
            <TableCell className="font-medium">{row.communeName}</TableCell>
            {row.masked ? (
              <TableCell colSpan={6} className="text-right text-muted-foreground">
                {MASKED_VALUE_LABEL} demandes
              </TableCell>
            ) : (
              <>
                <TableCell className="tabular text-right">
                  {integer.format(row.total ?? 0)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {integer.format(row.received ?? 0)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {integer.format(row.inProgress ?? 0)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {integer.format(row.resolved ?? 0)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {formatDelay(row.medianHoursToTake)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {formatDelay(row.medianHoursToResolve)}
                </TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
