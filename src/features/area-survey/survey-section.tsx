import type { ReactNode } from "react";
import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import type { CitationStatus, SurveyEstimates, TargetEstimate } from "@/modules/area-survey";
import { cropGroupLabel } from "@/modules/satellite/crop-groups";

const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("fr-FR");
const ratio = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const STATUS: Record<CitationStatus, { label: string; variant: "success" | "watch" | "warning" }> =
  {
    cite: { label: "À citer", variant: "success" },
    indicative: { label: "Indicatif", variant: "watch" },
    "do-not-cite": { label: "À ne pas citer", variant: "warning" },
  };

export function targetLabel(target: string): string {
  return target === "CULTIVATED" ? "Terres cultivées" : cropGroupLabel(target);
}

function Heading({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <HelpTip label={help}>{children}</HelpTip>
    </div>
  );
}

function StatusBadge({ status }: { status: CitationStatus }) {
  return <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>;
}

function withMargin(estimate: TargetEstimate): string {
  return `${hectares.format(estimate.areaHa)} ± ${hectares.format(estimate.marginHa)} ha`;
}

// Surfaces par culture estimées par sondage (ADR-0033), vue du ministère : chaque chiffre avec
// sa marge à 95 %, son coefficient de variation et ce qu'on peut en faire.
export function SurveySection({ survey }: { survey: SurveyEstimates & { campaignCode: string } }) {
  const cultivated = survey.totals.find((entry) => entry.target === "CULTIVATED");
  const visited = survey.observed + survey.inaccessible;
  const targets = [...survey.totals].sort(
    (a, b) => Number(b.target === "CULTIVATED") - Number(a.target === "CULTIVATED"),
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Terres cultivées"
          value={cultivated ? withMargin(cultivated) : "Pas encore"}
          wordValue
          source={cultivated ? STATUS[cultivated.status].label : "Aucun point constaté"}
          reliability="ESTIMATED"
        />
        <StatTile
          label="Points constatés"
          value={survey.observed}
          source={`Sur ${count.format(survey.drawn)} tirés`}
        />
        <StatTile
          label="Inaccessibles"
          value={survey.inaccessible}
          source={
            visited > 0
              ? `${percent.format(survey.inaccessible / visited)} des points visités`
              : "Aucun point visité"
          }
        />
        <StatTile
          label="Communes d'enquête"
          value={survey.communes.length}
          source={`Campagne ${survey.campaignCode}`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Heading title="Surfaces par culture" help="Surfaces par sondage">
          Des points tirés au hasard dans chaque commune d&apos;enquête, où l&apos;agent note ce
          qu&apos;il voit. La carte des pixels corrige leur moyenne (estimateur par régression) : le
          gain dit combien de points elle vaut en plus. À citer : coefficient de variation de 10 %
          au plus et 30 points au moins. Indicatif : jusqu&apos;à 20 %.
        </Heading>
        <SortableTable
          caption="Communes d'enquête réunies"
          initialSort={{ key: "area", direction: "descending" }}
          columns={[
            { key: "name", label: "Culture" },
            { key: "area", label: "Surface (ha)", align: "right" },
            { key: "margin", label: "Marge à 95 %", align: "right" },
            { key: "cv", label: "CV", align: "right" },
            { key: "status", label: "Usage" },
            { key: "gain", label: "Gain de la carte", align: "right" },
            { key: "map", label: "Carte seule (ha)", align: "right" },
          ]}
          rows={targets.map((entry) => ({
            key: entry.target,
            cells: {
              name: { display: targetLabel(entry.target), sort: entry.target },
              area: { display: hectares.format(entry.areaHa), sort: entry.areaHa },
              margin: { display: `± ${hectares.format(entry.marginHa)}`, sort: entry.marginHa },
              cv: {
                display: entry.cv === null ? "Aucun point" : percent.format(entry.cv),
                sort: entry.cv,
              },
              status: {
                display: <StatusBadge status={entry.status} />,
                sort: entry.status,
              },
              gain: {
                display: entry.gain === null ? "Sans carte" : `× ${ratio.format(entry.gain)}`,
                sort: entry.gain,
              },
              map: {
                display: entry.mapHa === null ? "Non mesurée" : hectares.format(entry.mapHa),
                sort: entry.mapHa,
              },
            },
          }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Heading title="Par commune" help="Sondage par commune">
          Une commune seule compte environ 120 points : ses chiffres restent indicatifs. Au-delà de
          10 % de points inaccessibles, les points manquants peuvent fausser le chiffre.
        </Heading>
        <SortableTable
          caption="Terres cultivées par commune d'enquête"
          initialSort={{ key: "name", direction: "ascending" }}
          columns={[
            { key: "name", label: "Commune" },
            { key: "drawn", label: "Points tirés", align: "right" },
            { key: "observed", label: "Constatés", align: "right" },
            { key: "response", label: "Réponse", align: "right" },
            { key: "cultivated", label: "Terres cultivées" },
            { key: "status", label: "Usage" },
          ]}
          rows={survey.communes.map((commune) => {
            const estimate = commune.targets.find((entry) => entry.target === "CULTIVATED");
            return {
              key: commune.code,
              cells: {
                name: { display: commune.name, sort: commune.name },
                drawn: { display: count.format(commune.drawn), sort: commune.drawn },
                observed: { display: count.format(commune.observed), sort: commune.observed },
                response: {
                  display:
                    commune.responseRate === null
                      ? "Pas visitée"
                      : percent.format(commune.responseRate),
                  sort: commune.responseRate,
                },
                cultivated: {
                  display: estimate ? withMargin(estimate) : "Pas encore",
                  sort: estimate?.areaHa ?? null,
                },
                status: {
                  display: estimate ? <StatusBadge status={estimate.status} /> : "",
                  sort: estimate?.status ?? null,
                },
              },
            };
          })}
        />
      </div>

      <SourceCaption
        source={
          survey.synthetic
            ? "constats et carte de démonstration, estimateur par régression (ADR-0033)"
            : "constats des agents ATDA aux points tirés, carte des pixels Copernicus Sentinel-2, estimateur par régression (ADR-0033)"
        }
      />
    </div>
  );
}
