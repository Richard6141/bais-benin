import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import type { VegetationSummary } from "@/modules/satellite";
import { formatNdvi, reasonLabel, vegetationSourceLabel } from "./vegetation-labels";

const share = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

const SUB_SEASONS: Record<string, string> = {
  MAIN_RAINY: "Grande saison",
  SHORT_RAINY: "Petite saison",
  ANNUAL: "Campagne entière",
};

// Confrontation déclaration / satellite pour le pilotage (ADR-0016) : comptes par verdict, communes
// les plus signalées et parcelles à vérifier, en codes seulement (aucun nom de producteur).
export function VegetationSection({ summary }: { summary: VegetationSummary }) {
  const count = (status: string) =>
    summary.byStatus.find((entry) => entry.status === status)?.count ?? 0;
  const judged = count("CONSISTENT") + count("TO_VERIFY");
  const toVerify = count("TO_VERIFY");
  const last = summary.sources.reduce<Date | null>(
    (latest, source) =>
      !latest || source.lastComputedAt > latest ? source.lastComputedAt : latest,
    null,
  );
  const sources = summary.sources.map((source) => vegetationSourceLabel(source.sourceId));

  if (judged + count("PENDING") + count("INSUFFICIENT_DATA") === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune parcelle n&apos;a encore été confrontée à l&apos;imagerie satellite pour la campagne{" "}
        {summary.campaignCode}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Parcelles jugées"
          value={judged}
          source={`Campagne ${summary.campaignCode}, saisons terminées`}
        />
        <StatTile
          label="À vérifier sur le terrain"
          value={toVerify}
          source={judged > 0 ? `${share.format(toVerify / judged)} des parcelles jugées` : "—"}
          reliability="ESTIMATED"
        />
        <StatTile
          label="Saison encore en cours"
          value={count("PENDING")}
          source="Pic de végétation attendu à venir"
        />
        <StatTile
          label="Trop de nuages pour conclure"
          value={count("INSUFFICIENT_DATA")}
          source="Réexaminées au passage suivant"
        />
      </div>
      {summary.communes.length > 0 ? (
        <SortableTable
          caption="Communes aux parcelles les plus signalées"
          initialSort={{ key: "toVerify", direction: "descending" }}
          columns={[
            { key: "name", label: "Commune" },
            { key: "checked", label: "Parcelles jugées", align: "right" },
            { key: "toVerify", label: "À vérifier", align: "right" },
            { key: "share", label: "Part", align: "right" },
          ]}
          rows={summary.communes.map((commune) => ({
            key: commune.code,
            href: `/pilotage/communes/${commune.code}`,
            cells: {
              name: { display: commune.name, sort: commune.name },
              checked: { display: String(commune.checked), sort: commune.checked },
              toVerify: { display: String(commune.to_verify), sort: commune.to_verify },
              share: {
                display:
                  commune.checked > 0 ? share.format(commune.to_verify / commune.checked) : "—",
                sort: commune.checked > 0 ? commune.to_verify / commune.checked : null,
              },
            },
          }))}
        />
      ) : null}
      {summary.flagged.length > 0 ? (
        <SortableTable
          caption="Parcelles à vérifier, écart au profil attendu le plus fort d'abord"
          initialSort={{ key: "gap", direction: "descending" }}
          columns={[
            { key: "parcel", label: "Parcelle" },
            { key: "farm", label: "Exploitation" },
            { key: "commune", label: "Commune" },
            { key: "crop", label: "Culture déclarée" },
            { key: "reason", label: "Motif" },
            { key: "peak", label: "NDVI observé", align: "right" },
            { key: "gap", label: "Attendu", align: "right" },
          ]}
          rows={summary.flagged.map((row) => ({
            key: row.parcel_code,
            cells: {
              parcel: { display: row.parcel_code, sort: row.parcel_code },
              farm: { display: row.farm_code, sort: row.farm_code },
              commune: { display: row.commune_name, sort: row.commune_name },
              crop: {
                display: `${row.crop_name} (${SUB_SEASONS[row.sub_season] ?? row.sub_season})`,
                sort: row.crop_name,
              },
              reason: { display: reasonLabel(row.reason) ?? "—", sort: row.reason },
              peak: { display: formatNdvi(row.peak_ndvi), sort: row.peak_ndvi },
              gap: {
                display: `≥ ${formatNdvi(row.expected_ndvi)}`,
                sort: row.expected_ndvi - (row.peak_ndvi ?? 0),
              },
            },
          }))}
        />
      ) : null}
      <SourceCaption
        source={sources.length > 0 ? sources.join(" ; ") : "—"}
        date={last ? `calcul du ${date.format(last)}` : undefined}
      />
      <p className="text-xs text-muted-foreground">
        NDVI moyen de la parcelle par décade, nuages exclus, comparé au profil attendu de la culture
        principale déclarée et de la zone agro-écologique. Un écart appelle une visite de
        vérification ; il ne prouve pas une fausse déclaration (association de cultures, semis
        tardif, petite parcelle).
      </p>
    </div>
  );
}
