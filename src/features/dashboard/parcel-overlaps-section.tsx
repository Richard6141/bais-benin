import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ParcelOverlapList } from "@/modules/registry";

const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// Parcelles dont les contours se recouvrent : doublon dans une même exploitation (souvent une
// parcelle relevée deux fois) ou recouvrement entre exploitations (double déclaration, conflit
// foncier). Identifiants seulement, aucun nom : l'agent concerné vérifie sur place.
export function ParcelOverlapsSection({ overlaps }: { overlaps: ParcelOverlapList }) {
  if (overlaps.total === 0) {
    return (
      <p className="rounded-sm border bg-muted/40 p-4 text-sm">
        Aucun recouvrement significatif entre parcelles relevées.
      </p>
    );
  }
  const crossFarm = overlaps.pairs.filter((p) => p.kind === "OTHER_FARM").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="tabular font-bold">{overlaps.total}</span> recouvrement
        {overlaps.total > 1 ? "s" : ""} à vérifier
        {overlaps.pairs.length < overlaps.total
          ? ` ; les ${overlaps.pairs.length} plus étendus ci-dessous`
          : ""}
        , dont {crossFarm} entre exploitations différentes dans cette liste.
      </p>
      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parcelle</TableHead>
              <TableHead>Recouvre</TableHead>
              <TableHead>Commune</TableHead>
              <TableHead className="text-right">En commun (ha)</TableHead>
              <TableHead className="text-right">Part</TableHead>
              <TableHead>Nature</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overlaps.pairs.map((pair) => (
              <TableRow key={`${pair.parcelCode}-${pair.otherParcelCode}`}>
                <TableCell className="font-mono text-xs">{pair.parcelCode}</TableCell>
                <TableCell className="font-mono text-xs">{pair.otherParcelCode}</TableCell>
                <TableCell>
                  <span className="block">{pair.communeName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pair.departementName}
                  </span>
                </TableCell>
                <TableCell className="tabular text-right">
                  {hectares.format(pair.overlapHa)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {Math.round(pair.overlapShare * 100)} %
                </TableCell>
                <TableCell>
                  <Badge variant={pair.kind === "OTHER_FARM" ? "warning" : "outline"}>
                    {pair.kind === "OTHER_FARM" ? "Entre exploitations" : "Même exploitation"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Un recouvrement compte à partir de 100 m² et 5 % de la plus petite des deux parcelles : un
        simple contact de bordure ou l&apos;imprécision du GPS n&apos;apparaissent pas.
      </p>
    </div>
  );
}
