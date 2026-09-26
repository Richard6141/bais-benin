import { NoValue } from "@/components/data-display/no-value";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PublicLaureate } from "@/modules/public-ranking";

const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const yields = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Lauréats d'un palmarès publié : rang dans le classement complet, nom, commune, production (et
// rendement pour un classement au rendement). Jamais de téléphone ni d'identifiant.
export function LaureatesTable({
  laureates,
  metric,
  caption,
}: {
  laureates: readonly PublicLaureate[];
  metric: "production" | "yield";
  caption?: string;
}) {
  const byYield = metric === "yield";
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-right">Rang</TableHead>
            <TableHead>Producteur</TableHead>
            <TableHead>Commune</TableHead>
            <TableHead className={byYield ? "text-right" : "text-right font-bold"}>
              Production (t)
            </TableHead>
            {byYield ? (
              <TableHead className="text-right font-bold">Rendement (t/ha)</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {laureates.map((laureate) => (
            <TableRow key={laureate.rank}>
              <TableCell className="tabular text-right font-bold">{laureate.rank}</TableCell>
              <TableCell className="font-medium">{laureate.name}</TableCell>
              <TableCell>
                <span className="block">{laureate.communeName}</span>
                <span className="block text-xs text-muted-foreground">
                  {laureate.departementName}
                </span>
              </TableCell>
              <TableCell className="tabular text-right">
                {tonnes.format(laureate.productionT)}
              </TableCell>
              {byYield ? (
                <TableCell className="tabular text-right">
                  {laureate.yieldTPerHa === null ? (
                    <NoValue />
                  ) : (
                    yields.format(laureate.yieldTPerHa)
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
