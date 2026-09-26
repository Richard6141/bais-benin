import { SortableTable, type SortableRow } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { CROP_MAP_CLASSES } from "@/features/agri-map/map-config";
import type { CropAreaComparison, CropAreaFigures } from "@/modules/satellite";

const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

/** Communes du classement : les premières à couvrir, pas toute la liste. */
const RANKED_COMMUNES = 20;

const CLASS_LABELS = new Map<string, string>(
  CROP_MAP_CLASSES.map((entry) => [entry.key, entry.label]),
);

export function cropClassLabel(key: string): string {
  return CLASS_LABELS.get(key) ?? key;
}

function sourceLabel(sources: CropAreaComparison["sources"], radarRice: boolean): string {
  const demo = sources.some((source) => source.sourceId === "BAIS_SEED");
  const measured = sources.filter((source) => source.sourceId !== "BAIS_SEED");
  const last = measured.reduce<Date | null>(
    (latest, source) => (!latest || source.computedAt > latest ? source.computedAt : latest),
    null,
  );
  const resolution = measured[0]?.resolutionM;
  const parts = [];
  if (last) {
    parts.push(
      `Copernicus Sentinel-2, 12 derniers mois, pixels de ${resolution ?? 120} m, calcul du ${date.format(last)}`,
    );
  }
  if (radarRice) parts.push("riz complété par le radar Sentinel-1");
  if (demo) parts.push("estimations de démonstration déduites du registre");
  return parts.join(", ");
}

function figureCells(figures: CropAreaFigures) {
  return {
    satellite: { display: hectares.format(figures.satelliteHa), sort: figures.satelliteHa },
    declared: { display: hectares.format(figures.declaredHa), sort: figures.declaredHa },
    rate: {
      display:
        figures.enrolmentRate === null ? "Non calculé" : percent.format(figures.enrolmentRate),
      sort: figures.enrolmentRate,
    },
    gap: { display: hectares.format(figures.gapHa), sort: figures.gapHa },
  };
}

const FIGURE_COLUMNS = [
  { key: "satellite", label: "Vue par satellite (ha)", align: "right" },
  { key: "declared", label: "Déclarée (ha)", align: "right" },
  { key: "rate", label: "Enrôlement", align: "right" },
  { key: "gap", label: "À enregistrer (ha)", align: "right" },
] as const;

// Surfaces vues par satellite face au registre (ADR-0021) : taux d'enrôlement par culture et
// par zone, puis les communes au plus gros écart, où envoyer les agents en premier. Toujours
// présentées comme une estimation à confirmer.
export function CropAreaSection({ comparison }: { comparison: CropAreaComparison }) {
  const { totals } = comparison;
  if (totals.estimatedCommunes === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune surface n&apos;a encore été estimée par satellite pour la campagne{" "}
        {comparison.campaignCode}. Le calcul mensuel passe les huit premiers jours du mois.
      </p>
    );
  }
  const scope = comparison.cropClass ? cropClassLabel(comparison.cropClass) : "Toutes cultures";
  const communeRows: SortableRow[] = comparison.communes
    .slice(0, RANKED_COMMUNES)
    .map((commune) => ({
      key: commune.code,
      href: `/pilotage/communes/${commune.code}`,
      cells: {
        name: { display: commune.name, sort: commune.name },
        departement: { display: commune.departementName, sort: commune.departementName },
        ...figureCells(commune),
        clouds: {
          display: percent.format(commune.unclassifiedShare),
          sort: commune.unclassifiedShare,
        },
      },
    }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Vue par satellite"
          value={totals.satelliteHa}
          unit="ha"
          source={scope}
          reliability="ESTIMATED"
        />
        <StatTile
          label="Déclarée au registre"
          value={totals.declaredHa}
          unit="ha"
          source={`Campagne ${comparison.campaignCode}`}
        />
        <StatTile
          label="Taux d'enrôlement"
          value={
            totals.enrolmentRate === null ? "Non calculé" : percent.format(totals.enrolmentRate)
          }
          wordValue={totals.enrolmentRate === null}
          source="Déclarée rapportée à la surface vue"
          reliability="ESTIMATED"
        />
        <StatTile
          label="À enregistrer"
          value={totals.gapHa}
          unit="ha"
          source={`${totals.estimatedCommunes} communes estimées sur ${totals.communes}`}
          reliability="ESTIMATED"
        />
      </div>

      {comparison.cropClass === null ? (
        <SortableTable
          caption="Par culture"
          initialSort={{ key: "satellite", direction: "descending" }}
          columns={[{ key: "name", label: "Culture" }, ...FIGURE_COLUMNS]}
          rows={comparison.byClass.map((entry) => ({
            key: entry.cropClass,
            cells: {
              name: { display: cropClassLabel(entry.cropClass), sort: entry.cropClass },
              ...figureCells(entry),
            },
          }))}
        />
      ) : null}

      <SortableTable
        caption="Par département"
        initialSort={{ key: "gap", direction: "descending" }}
        columns={[{ key: "name", label: "Département" }, ...FIGURE_COLUMNS]}
        rows={comparison.departements.map((entry) => ({
          key: entry.code,
          cells: { name: { display: entry.name, sort: entry.name }, ...figureCells(entry) },
        }))}
      />

      <SortableTable
        caption="Communes où envoyer les agents en premier"
        ranked
        initialSort={{ key: "gap", direction: "descending" }}
        columns={[
          { key: "name", label: "Commune" },
          { key: "departement", label: "Département" },
          ...FIGURE_COLUMNS,
          { key: "clouds", label: "Non classé", align: "right" },
        ]}
        rows={communeRows}
      />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-warning">Estimation satellite, à confirmer</p>
        <SourceCaption source={sourceLabel(comparison.sources, comparison.radarRice)} />
      </div>
    </div>
  );
}
