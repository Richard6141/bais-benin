import type { ReactNode } from "react";
import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { HelpTip } from "@/components/forms/help-tip";
import { cropGroupLabel, type ParcelCropOverview } from "@/modules/satellite";
import { cropClassLabel } from "./crop-area-section";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("fr-FR");
const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

function rate(value: number | null): string {
  return value === null ? "Trop peu" : percent.format(value);
}

function Heading({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <HelpTip label={help}>{children}</HelpTip>
    </div>
  );
}

function modelSource(model: ParcelCropOverview["model"]): string {
  const base = `modèle ${model.version} du ${date.format(model.trainedAt)}`;
  return model.synthetic
    ? `séries de démonstration des parcelles, ${base}`
    : `Copernicus Sentinel-2 et Sentinel-1 sur le contour de chaque parcelle, ${base}`;
}

// Cultures mesurées par parcelle (ADR-0030 à 0032), vue du ministère : ce que vaut le modèle sur
// une commune qu'il n'a jamais vue, l'accord avec les déclarations et les désaccords à vérifier.
export function ParcelCropSection({ overview }: { overview: ParcelCropOverview }) {
  const { accuracy, agreement, model } = overview;
  const interval = accuracy?.interval;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Heading title="Précision du modèle" help="Précision du modèle">
          Chaque commune pilote est laissée de côté à son tour : un modèle entraîné sur les autres
          classe ses parcelles vérifiées. La précision dit ce que vaut le modèle sur une commune
          qu&apos;il n&apos;a jamais vue. La marge est l&apos;intervalle de confiance à 95 %.
        </Heading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Sur une commune nouvelle"
            value={accuracy ? rate(accuracy.accuracy) : "Pas encore"}
            wordValue={!accuracy || accuracy.accuracy === null}
            source={
              interval
                ? `Marge ${percent.format(interval.low)} à ${percent.format(interval.high)}`
                : "Validation croisée par commune"
            }
            reliability="ESTIMATED"
          />
          <StatTile
            label="Quand le modèle est sûr"
            value={rate(accuracy?.confident.accuracy ?? null)}
            wordValue={(accuracy?.confident.accuracy ?? null) === null}
            source={
              accuracy?.confident.share != null
                ? `${percent.format(accuracy.confident.share)} des parcelles, confiance de 60 % ou plus`
                : "Confiance de 60 % ou plus"
            }
          />
          <StatTile
            label="Parcelles mesurées"
            value={agreement.parcels}
            source={`Dont ${count.format(agreement.differs)} vues autrement que déclarées`}
          />
          <StatTile
            label="Étiquettes de terrain"
            value={model.fieldVisitLabels}
            source={`Sur ${count.format(model.trainingParcels)} parcelles d'entraînement`}
          />
        </div>
      </div>

      {accuracy ? (
        <>
          <SortableTable
            caption="Précision par culture"
            initialSort={{ key: "parcels", direction: "descending" }}
            columns={[
              { key: "name", label: "Culture" },
              { key: "parcels", label: "Parcelles", align: "right" },
              { key: "recall", label: "Reconnues", align: "right" },
              { key: "precision", label: "Classe fiable", align: "right" },
              { key: "confusion", label: "Confusion principale" },
            ]}
            rows={accuracy.classes.map((entry) => ({
              key: entry.group,
              cells: {
                name: { display: cropGroupLabel(entry.group), sort: entry.group },
                parcels: { display: count.format(entry.parcels), sort: entry.parcels },
                recall: { display: rate(entry.recall), sort: entry.recall },
                precision: { display: rate(entry.precision), sort: entry.precision },
                confusion: {
                  display: entry.mainConfusion
                    ? `${cropGroupLabel(entry.mainConfusion.predicted)} (${percent.format(entry.mainConfusion.share)})`
                    : "Aucune",
                  sort: entry.mainConfusion?.share ?? 0,
                },
              },
            }))}
          />
          <SortableTable
            caption="Précision par commune laissée de côté"
            initialSort={{ key: "accuracy", direction: "ascending" }}
            columns={[
              { key: "name", label: "Commune" },
              { key: "judged", label: "Parcelles jugées", align: "right" },
              { key: "accuracy", label: "Précision", align: "right" },
            ]}
            rows={accuracy.communes.map((commune) => ({
              key: commune.code,
              cells: {
                name: { display: commune.name, sort: commune.name },
                judged: { display: count.format(commune.judged), sort: commune.judged },
                accuracy: { display: rate(commune.accuracy), sort: commune.accuracy },
              },
            }))}
          />
          <div className="flex flex-col gap-2">
            <Heading title="Matrice de confusion" help="Matrice de confusion par parcelle">
              Chaque ligne est la culture d&apos;une parcelle vérifiée, constatée sur place ou
              déclarée, chaque colonne la culture que le modèle y voit sans connaître sa commune. La
              diagonale compte les parcelles bien reconnues.
            </Heading>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Culture de référence en lignes, culture mesurée en colonnes
                </caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Référence
                    </th>
                    {accuracy.columns.map((key) => (
                      <th key={key} scope="col" className="px-3 py-2 text-right font-medium">
                        {cropGroupLabel(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accuracy.rows.map((row) => (
                    <tr key={row.reference} className="border-t">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {cropGroupLabel(row.reference)}
                      </th>
                      {accuracy.columns.map((key) => (
                        <td
                          key={key}
                          className={
                            key === row.reference
                              ? "tabular px-3 py-2 text-right font-semibold"
                              : "tabular px-3 py-2 text-right text-muted-foreground"
                          }
                        >
                          {count.format(row.counts[key] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Heading title="Accord avec la déclaration" help="Accord avec la déclaration">
          Toutes les parcelles lues des communes pilotes, vérifiées ou non. En accord : le satellite
          voit la culture déclarée avec au moins 60 % de confiance. Différente : il voit une autre
          culture avec cette confiance. Incertaine : moins de 60 %.
        </Heading>
        <SortableTable
          caption="Par culture déclarée"
          initialSort={{ key: "parcels", direction: "descending" }}
          columns={[
            { key: "name", label: "Culture déclarée" },
            { key: "parcels", label: "Parcelles", align: "right" },
            { key: "agrees", label: "En accord", align: "right" },
            { key: "differs", label: "Différente", align: "right" },
            { key: "uncertain", label: "Incertaine", align: "right" },
            { key: "rate", label: "Taux d'accord", align: "right" },
          ]}
          rows={agreement.byCrop.map((entry) => ({
            key: entry.group,
            cells: {
              name: { display: cropGroupLabel(entry.group), sort: entry.group },
              parcels: { display: count.format(entry.parcels), sort: entry.parcels },
              agrees: { display: count.format(entry.agrees), sort: entry.agrees },
              differs: { display: count.format(entry.differs), sort: entry.differs },
              uncertain: { display: count.format(entry.uncertain), sort: entry.uncertain },
              rate: { display: rate(entry.agreementRate), sort: entry.agreementRate },
            },
          }))}
        />
      </div>

      {overview.disagreements.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Heading title="Désaccords à vérifier" help="Désaccords à vérifier">
            Parcelles où le satellite voit sûrement une autre culture que celle déclarée, les plus
            sûres d&apos;abord. Chacune s&apos;ouvre sur la carte. Les agents les ont aussi en tête
            de leur file de visite.
          </Heading>
          <SortableTable
            caption={
              agreement.differs > overview.disagreements.length
                ? `Les ${overview.disagreements.length} plus sûrs sur ${count.format(agreement.differs)}`
                : "Parcelles vues autrement que déclarées"
            }
            initialSort={{ key: "confidence", direction: "descending" }}
            columns={[
              { key: "parcel", label: "Parcelle" },
              { key: "commune", label: "Commune" },
              { key: "declared", label: "Déclarée" },
              { key: "measured", label: "Vue par satellite" },
              { key: "confidence", label: "Confiance", align: "right" },
            ]}
            rows={overview.disagreements.map((entry) => ({
              key: entry.parcelId,
              href: `/carte?parcelle=${entry.parcelId}`,
              cells: {
                parcel: { display: entry.parcelCode, sort: entry.parcelCode },
                commune: { display: entry.communeName, sort: entry.communeName },
                declared: {
                  display: entry.declaredGroup ? cropGroupLabel(entry.declaredGroup) : "Aucune",
                  sort: entry.declaredGroup ?? "",
                },
                measured: {
                  display: cropGroupLabel(entry.measuredGroup),
                  sort: entry.measuredGroup,
                },
                confidence: { display: percent.format(entry.confidence), sort: entry.confidence },
              },
            }))}
          />
        </div>
      ) : null}

      <SourceCaption source={modelSource(model)} />
    </div>
  );
}

// Surfaces par culture mesurées parcelle par parcelle, face à la carte des pixels de la commune.
export function ParcelCropAreaSection({ overview }: { overview: ParcelCropOverview }) {
  const { areas, model } = overview;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Heading title="Par culture" help="Surfaces par culture">
          Surface classée : parcelles dont c&apos;est la culture mesurée. Surface pondérée : chaque
          parcelle compte pour la probabilité que le modèle donne à cette culture, ce qui tient
          compte des parcelles incertaines. Déclarée : parcelles dont c&apos;est la culture
          déclarée.
        </Heading>
        <SortableTable
          caption="Surfaces mesurées par culture, communes pilotes"
          initialSort={{ key: "weighted", direction: "descending" }}
          columns={[
            { key: "name", label: "Culture" },
            { key: "parcels", label: "Parcelles", align: "right" },
            { key: "classified", label: "Classée (ha)", align: "right" },
            { key: "weighted", label: "Pondérée (ha)", align: "right" },
            { key: "declared", label: "Déclarée (ha)", align: "right" },
          ]}
          rows={areas.byCrop.map((entry) => ({
            key: entry.group,
            cells: {
              name: { display: cropGroupLabel(entry.group), sort: entry.group },
              parcels: {
                display: count.format(entry.classifiedParcels),
                sort: entry.classifiedParcels,
              },
              classified: {
                display: hectares.format(entry.classifiedHa),
                sort: entry.classifiedHa,
              },
              weighted: { display: hectares.format(entry.weightedHa), sort: entry.weightedHa },
              declared: { display: hectares.format(entry.declaredHa), sort: entry.declaredHa },
            },
          }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Heading title="Face à la carte des pixels" help="Parcelles face à la carte des pixels">
          Les parcelles mesurées ne couvrent que les exploitations enregistrées, la carte des pixels
          voit toute la commune. La part couverte est donc un taux d&apos;enrôlement vu par
          satellite, pas une erreur. Tant que la carte est en calibrage, ses surfaces ne sont pas à
          citer.
        </Heading>
        <SortableTable
          caption="Par commune et par classe de la carte"
          initialSort={{ key: "commune", direction: "ascending" }}
          columns={[
            { key: "commune", label: "Commune" },
            { key: "class", label: "Classe" },
            { key: "measured", label: "Parcelles (ha)", align: "right" },
            { key: "map", label: "Carte (ha)", align: "right" },
            { key: "share", label: "Part couverte", align: "right" },
          ]}
          rows={areas.byCommune.map((entry) => ({
            key: `${entry.communeCode}:${entry.cropClass}`,
            cells: {
              commune: { display: entry.communeName, sort: entry.communeName },
              class: { display: cropClassLabel(entry.cropClass), sort: entry.cropClass },
              measured: { display: hectares.format(entry.measuredHa), sort: entry.measuredHa },
              map: {
                display: entry.mapHa === null ? "Non mesurée" : hectares.format(entry.mapHa),
                sort: entry.mapHa,
              },
              share: { display: rate(entry.share), sort: entry.share },
            },
          }))}
        />
      </div>

      <SourceCaption source={modelSource(model)} />
    </div>
  );
}
