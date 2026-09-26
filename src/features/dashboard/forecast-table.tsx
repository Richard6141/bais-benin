import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Confidence, HarvestForecast } from "@/modules/analytics";

const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const CONFIDENCE: Record<Confidence, { label: string; variant: "success" | "info" | "outline" }> = {
  HIGH: { label: "Élevée", variant: "success" },
  MEDIUM: { label: "Moyenne", variant: "info" },
  LOW: { label: "Faible", variant: "outline" },
};

export function ForecastTable({
  forecast,
  hrefFor,
}: {
  forecast: HarvestForecast;
  hrefFor?: (code: string) => string;
}) {
  const byDepartement = forecast.cropCode !== null;
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{byDepartement ? "Département" : "Culture"}</TableHead>
            <TableHead className="text-right">Surface semée (ha)</TableHead>
            <TableHead className="text-right font-bold">Production prévue (t)</TableHead>
            <TableHead className="text-right">Fourchette (t)</TableHead>
            <TableHead className="text-right">
              {forecast.previousCampaign ? forecast.previousCampaign.code : "Précédente"} (t)
            </TableHead>
            <TableHead className="text-right">Variation</TableHead>
            <TableHead>Confiance</TableHead>
            {byDepartement ? null : <TableHead>Satellite</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {forecast.rows.map((row) => {
            const confidence = CONFIDENCE[row.confidence];
            return (
              <TableRow key={row.code}>
                <TableCell className="font-medium">
                  {hrefFor ? (
                    <Link
                      href={hrefFor(row.code) as Route}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </TableCell>
                <TableCell className="tabular text-right">{hectares.format(row.areaHa)}</TableCell>
                <TableCell className="tabular text-right font-bold">
                  {tonnes.format(row.productionT)}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {tonnes.format(row.lowT)} – {tonnes.format(row.highT)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {row.previousT === null ? "—" : tonnes.format(row.previousT)}
                </TableCell>
                <TableCell className="tabular text-right whitespace-nowrap">
                  {row.changePct === null ? (
                    "—"
                  ) : row.deficit ? (
                    <Badge variant="warning">{signed.format(row.changePct)} % · déficit</Badge>
                  ) : (
                    `${signed.format(row.changePct)} %`
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={confidence.variant}>{confidence.label}</Badge>
                </TableCell>
                {byDepartement ? null : (
                  <TableCell className="tabular text-sm whitespace-nowrap">
                    {row.satelliteFlagShare === null
                      ? "—"
                      : `${Math.round(row.satelliteFlagShare * 100)} % à vérifier`}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
