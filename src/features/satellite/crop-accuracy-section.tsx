import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { HelpTip } from "@/components/forms/help-tip";
import type { CropMapAccuracy } from "@/modules/satellite";
import { cropClassLabel } from "./crop-area-section";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("fr-FR");
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

function rate(value: number | null): string {
  return value === null ? "Trop peu" : percent.format(value);
}

function sourceLabel(sources: CropMapAccuracy["sources"]): string {
  const measured = sources.filter((source) => source.sourceId !== "BAIS_SEED");
  const last = measured.reduce<Date | null>(
    (latest, source) =>
      !latest || source.lastComputedAt > latest ? source.lastComputedAt : latest,
    null,
  );
  const parts = [];
  if (last) {
    parts.push(`Copernicus Sentinel-2, pixels de 10 m sur le contour relevé, ${date.format(last)}`);
  }
  if (sources.some((source) => source.sourceId === "BAIS_SEED")) {
    parts.push("contrôles de démonstration");
  }
  return parts.join(", ");
}

// Précision de la carte des cultures (ADR-0021) : sur les parcelles des exploitations vérifiées,
// la classe vue par satellite face à la culture déclarée. Dit au ministère quelle confiance
// accorder aux surfaces de la page, culture par culture.
export function CropAccuracySection({ accuracy }: { accuracy: CropMapAccuracy }) {
  if (accuracy.checked + accuracy.unclassified === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune parcelle vérifiée n&apos;a encore été contrôlée par satellite pour la campagne{" "}
        {accuracy.campaignCode}.
      </p>
    );
  }
  const columns = accuracy.observedColumns;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Précision globale"
          value={rate(accuracy.overallAccuracy)}
          wordValue={accuracy.overallAccuracy === null}
          source="Parcelles reconnues dans leur culture"
          reliability="ESTIMATED"
        />
        <StatTile
          label="Parcelles contrôlées"
          value={accuracy.checked}
          source={`Dont ${count.format(accuracy.fieldVerified)} visitées sur le terrain`}
        />
        <StatTile
          label="Sans classe dominante"
          value={accuracy.unclassified}
          source="Nuages ou parcelle trop petite"
        />
      </div>

      <SortableTable
        caption="Par culture"
        initialSort={{ key: "parcels", direction: "descending" }}
        columns={[
          { key: "name", label: "Culture déclarée" },
          { key: "parcels", label: "Parcelles", align: "right" },
          { key: "recall", label: "Reconnues", align: "right" },
          { key: "precision", label: "Classe fiable", align: "right" },
          { key: "confusion", label: "Confusion principale" },
        ]}
        rows={accuracy.classes.map((entry) => ({
          key: entry.cropClass,
          cells: {
            name: { display: cropClassLabel(entry.cropClass), sort: entry.cropClass },
            parcels: { display: count.format(entry.parcels), sort: entry.parcels },
            recall: { display: rate(entry.recall), sort: entry.recall },
            precision: { display: rate(entry.precision), sort: entry.precision },
            confusion: {
              display: entry.mainConfusion
                ? `${cropClassLabel(entry.mainConfusion.observed)} (${percent.format(entry.mainConfusion.share)})`
                : "Aucune",
              sort: entry.mainConfusion?.share ?? 0,
            },
          },
        }))}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Matrice de confusion</h3>
          <HelpTip label="Matrice de confusion">
            Chaque ligne est une culture déclarée sur une parcelle vérifiée, chaque colonne la
            classe que le satellite y voit le plus. La diagonale compte les parcelles bien
            reconnues. « Reconnues » : part de la ligne sur la diagonale. « Classe fiable » : part
            de la colonne qui cultive vraiment cette culture.
          </HelpTip>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Culture déclarée en lignes, classe vue par satellite en colonnes
            </caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Déclarée
                </th>
                {columns.map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 text-right font-medium">
                    {cropClassLabel(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accuracy.rows.map((row) => (
                <tr key={row.declared} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {cropClassLabel(row.declared)}
                  </th>
                  {columns.map((key) => (
                    <td
                      key={key}
                      className={
                        key === row.declared
                          ? "tabular px-3 py-2 text-right font-semibold"
                          : "tabular px-3 py-2 text-right text-muted-foreground"
                      }
                    >
                      {count.format(row.counts[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SourceCaption source={sourceLabel(accuracy.sources)} />
    </div>
  );
}
