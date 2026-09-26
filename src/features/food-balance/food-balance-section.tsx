import type { ReactNode } from "react";
import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import type {
  AreaSource,
  BalanceStatus,
  CommuneBalance,
  FoodBalanceView,
} from "@/modules/food-balance";
import {
  FOOD_CROPS,
  NEEDS,
  SEVERE_THRESHOLD,
  SOURCES,
  type CitedSource,
} from "@/modules/food-balance/coefficients";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("fr-FR");

const STATUS: Record<
  BalanceStatus,
  { label: string; variant: "critical" | "warning" | "success" | "outline" }
> = {
  deficit: { label: "Déficit grave", variant: "critical" },
  tension: { label: "Tension", variant: "warning" },
  covered: { label: "Couverte", variant: "success" },
  "not-evaluated": { label: "Non évaluée", variant: "outline" },
};

const CROP_LABELS = new Map(FOOD_CROPS.map((crop) => [crop.cropCode, crop.label]));

function Cite({ source, children }: { source: CitedSource; children?: ReactNode }) {
  return (
    <HelpTip label={source.label}>
      {children}
      {children ? " " : ""}Source : {source.label}, {source.year}.
    </HelpTip>
  );
}

function sourceLabel(sources: readonly AreaSource[]): string {
  const labels = new Set(
    sources.map((source) =>
      source.kind === "survey" ? `Enquête ${source.campaignCode}` : `DSA ${source.campaignCode}`,
    ),
  );
  return [...labels].join(", ") || "Aucune";
}

function coverageText(balance: CommuneBalance): string {
  if (!balance.coverage) return balance.reason ?? "Non évaluée";
  const { central, low, high } = balance.coverage;
  return `${percent.format(central)} (${percent.format(low)} à ${percent.format(high)})`;
}

// Bilan alimentaire prévisionnel par commune (ADR-0035), vue du ministère : la production vivrière
// attendue de toute la commune, en calories, face aux besoins de sa population. La limite du
// calcul est dite en tête, chaque coefficient cite sa source et son année.
export function FoodBalanceSection({ view }: { view: FoodBalanceView }) {
  const evaluated = view.communes.length - view.counts["not-evaluated"];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Déficit grave"
          value={view.counts.deficit}
          source={`Sous ${percent.format(SEVERE_THRESHOLD)} des besoins`}
        />
        <StatTile label="En tension" value={view.counts.tension} source="De 78 % à 100 %" />
        <StatTile label="Couvertes" value={view.counts.covered} source="100 % ou plus" />
        <StatTile
          label="Communes évaluées"
          value={`${count.format(evaluated)} sur ${count.format(view.communes.length)}`}
          wordValue
          source="Les autres attendent une enquête ou une statistique DSA"
        />
      </div>

      {view.nationalCheck ? (
        <p className="text-sm">
          Contrôle national : la même méthode sur la production FAOSTAT {view.nationalCheck.year}{" "}
          couvre {percent.format(view.nationalCheck.coverage)} des besoins de la population{" "}
          {view.nationalCheck.populationYear}.
        </p>
      ) : null}

      <SortableTable
        caption={`Communes, campagne ${view.campaignCode}`}
        initialSort={{ key: "coverage", direction: "ascending" }}
        columns={[
          { key: "name", label: "Commune" },
          { key: "population", label: "Population", align: "right" },
          { key: "coverage", label: "Couverture", align: "right" },
          { key: "status", label: "Statut" },
          { key: "source", label: "Surfaces" },
          { key: "missing", label: "Cultures sans surface" },
        ]}
        rows={view.communes.map((balance) => ({
          key: balance.code,
          muted: balance.status === "not-evaluated",
          cells: {
            name: { display: balance.name, sort: balance.name },
            population: {
              display: balance.population === null ? "Inconnue" : count.format(balance.population),
              sort: balance.population,
            },
            coverage: { display: coverageText(balance), sort: balance.coverage?.central ?? null },
            status: {
              display: (
                <span className="flex flex-wrap items-center gap-1">
                  <Badge variant={STATUS[balance.status].variant}>
                    {STATUS[balance.status].label}
                  </Badge>
                  {balance.toConfirm ? <Badge variant="watch">À confirmer</Badge> : null}
                </span>
              ),
              sort: balance.status,
            },
            source: {
              display: sourceLabel(balance.crops.map((crop) => crop.source)),
              sort: balance.crops[0]?.source.kind ?? null,
            },
            missing: {
              display:
                balance.status === "not-evaluated" || balance.missingCrops.length === 0
                  ? ""
                  : balance.missingCrops.map((code) => CROP_LABELS.get(code) ?? code).join(", "),
              sort: balance.missingCrops.length,
            },
          },
        }))}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Coefficients</h3>
          <HelpTip label="Calcul">
            Pour chaque culture : production attendue, moins les semences de la campagne suivante,
            moins les pertes jusqu&apos;au ménage, puis extraction, part comestible et énergie. La
            somme est rapportée aux besoins de la population en céréales, racines et tubercules.
          </HelpTip>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Coefficients du bilan, par culture</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Culture
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Semences (kg/ha)
                    <Cite source={SOURCES.conversion} />
                  </span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Pertes
                    <Cite source={SOURCES.conversion}>
                      Stockage et transport, de la récolte au ménage.
                    </Cite>
                  </span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Extraction
                    <Cite source={SOURCES.conversion}>Riz usiné obtenu d&apos;un paddy.</Cite>
                  </span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Part comestible
                    <Cite source={SOURCES.composition} />
                  </span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    kcal pour 100 g
                    <Cite source={SOURCES.composition}>
                      Code de l&apos;aliment entre parenthèses.
                    </Cite>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {FOOD_CROPS.map((crop) => (
                <tr key={crop.cropCode} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {crop.label}
                  </th>
                  <td className="tabular px-3 py-2 text-right">{count.format(crop.seedKgPerHa)}</td>
                  <td className="tabular px-3 py-2 text-right">{percent.format(crop.lossShare)}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {percent.format(crop.extraction)}
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    {decimal.format(crop.edibleShare)}
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    {count.format(crop.kcalPer100g)} ({crop.foodCode})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center gap-1">
            Besoin moyen : {count.format(NEEDS.averageKcalPerDay)} kcal par personne et par jour
            <Cite source={SOURCES.needs} />
          </li>
          <li className="flex items-center gap-1">
            Besoin minimal : {count.format(NEEDS.minimumKcalPerDay)} kcal, seuil du déficit grave (
            {percent.format(SEVERE_THRESHOLD)} du besoin moyen)
            <Cite source={SOURCES.needs} />
          </li>
          <li className="flex items-center gap-1">
            Part des céréales, racines et tubercules dans l&apos;énergie :{" "}
            {percent.format(NEEDS.staplesShare)}
            <Cite source={SOURCES.staplesShare} />
          </li>
        </ul>
      </div>

      <SourceCaption
        source={`population ${view.population ? `${view.population.dataset}, ${view.population.year}` : "inconnue"} (WorldPop, CC BY 4.0) ; surfaces de l'enquête aréolaire et de la DSA ; rendements du registre, campagnes ${view.historyCampaigns.join(" et ") || "sans historique"} ; coefficients FAO et FAO/INFOODS`}
      />
    </div>
  );
}
