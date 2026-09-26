import type { ReactNode } from "react";
import { SortableTable } from "@/components/data-display/sortable-table";
import { SourceCaption } from "@/components/data-display/source-caption";
import { HelpTip } from "@/components/forms/help-tip";
import { Badge } from "@/components/ui/badge";
import type { OfficialReconciliation } from "@/modules/official-stats";
import { OfficialImportForm } from "./import-form";

const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("fr-FR");
const date = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Africa/Porto-Novo",
});

const SOURCE_LABELS: Record<string, string> = { MAEP_DSA: "DSA", FAOSTAT: "FAOSTAT" };

function Heading({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <HelpTip label={help}>{children}</HelpTip>
    </div>
  );
}

/** Données à demander tant qu'aucune statistique officielle n'est importée (ADR-0034). */
function DataToRequest() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
      <p className="font-semibold">Aucune statistique officielle importée</p>
      <p className="text-muted-foreground">
        La plateforme n&apos;invente aucun chiffre officiel. Pour rapprocher nos surfaces, importez
        :
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          DSA du MAEP : surfaces, productions et rendements par commune et par culture, campagnes
          2019-2020 à 2025-2026, en priorité Tchaourou, Tanguiéta, Bassila, Ouèssè et Ségbana, avec
          la méthode de chaque chiffre.
        </li>
        <li>
          FAOSTAT (cultures et produits animaux) : superficie récoltée, production et rendement du
          Bénin depuis 2015.
        </li>
      </ul>
    </div>
  );
}

// Statistiques officielles face à nos surfaces (ADR-0034), vue du ministère : import des chiffres
// de la DSA ou de FAOSTAT, puis, culture par culture, la couverture du registre et, dans les
// communes d'enquête, l'estimation par sondage.
export function OfficialSection({ reconciliation }: { reconciliation: OfficialReconciliation }) {
  const { imports, rows } = reconciliation;
  return (
    <div className="flex flex-col gap-6">
      <OfficialImportForm />

      {imports.length === 0 ? (
        <DataToRequest />
      ) : (
        <>
          <SortableTable
            caption="Chiffres importés"
            initialSort={{ key: "campaign", direction: "descending" }}
            columns={[
              { key: "source", label: "Source" },
              { key: "campaign", label: "Campagne" },
              { key: "rows", label: "Chiffres", align: "right" },
              { key: "date", label: "Importés le" },
            ]}
            rows={imports.map((entry) => ({
              key: `${entry.sourceId}:${entry.campaignCode}`,
              cells: {
                source: {
                  display: SOURCE_LABELS[entry.sourceId] ?? entry.sourceId,
                  sort: entry.sourceId,
                },
                campaign: { display: entry.campaignCode, sort: entry.campaignCode },
                rows: { display: count.format(entry.rows), sort: entry.rows },
                date: {
                  display: date.format(entry.lastImportedAt),
                  sort: entry.lastImportedAt.getTime(),
                },
              },
            }))}
          />

          <div className="flex flex-col gap-2">
            <Heading title="Surfaces officielles et les nôtres" help="Rapprochement">
              Pour chaque culture, la dernière surface officielle connue. Registre : surface
              déclarée pour la campagne {reconciliation.openCampaignCode}, et sa part de la surface
              officielle. Sondage : dans les communes d&apos;enquête, la surface estimée du groupe
              de cultures avec sa marge. D&apos;une campagne à l&apos;autre, une surface varie
              souvent de 10 à 20 % : l&apos;écart reste alors indicatif.
            </Heading>
            <SortableTable
              caption={`Surfaces officielles face à la campagne ${reconciliation.openCampaignCode}`}
              initialSort={{ key: "territory", direction: "ascending" }}
              columns={[
                { key: "territory", label: "Territoire" },
                { key: "crop", label: "Culture" },
                { key: "official", label: "Officiel (ha)", align: "right" },
                { key: "source", label: "Source" },
                { key: "registry", label: "Registre (ha)", align: "right" },
                { key: "share", label: "Couverture", align: "right" },
                { key: "survey", label: "Sondage (ha)" },
              ]}
              rows={rows.map((row) => ({
                key: `${row.sourceId}:${row.territoryCode}:${row.cropCode}`,
                cells: {
                  territory: { display: row.territoryName, sort: row.territoryName },
                  crop: { display: row.cropName, sort: row.cropName },
                  official: { display: hectares.format(row.officialHa), sort: row.officialHa },
                  source: {
                    display: `${SOURCE_LABELS[row.sourceId] ?? row.sourceId} ${row.campaignCode}`,
                    sort: row.campaignCode,
                  },
                  registry: { display: hectares.format(row.registryHa), sort: row.registryHa },
                  share: {
                    display:
                      row.registryShare === null ? "Sans objet" : percent.format(row.registryShare),
                    sort: row.registryShare,
                  },
                  survey: {
                    display: row.survey ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {hectares.format(row.survey.estimate.areaHa)} ±{" "}
                        {hectares.format(row.survey.estimate.marginHa)}
                        <Badge variant={row.survey.withinMargin ? "success" : "warning"}>
                          {row.survey.withinMargin ? "Dans la marge" : "Hors marge"}
                        </Badge>
                      </span>
                    ) : (
                      "Hors enquête"
                    ),
                    sort: row.survey?.estimate.areaHa ?? null,
                  },
                },
              }))}
            />
          </div>
        </>
      )}

      <SourceCaption source="fichiers importés par le ministère (DSA du MAEP, FAOSTAT), registre BAIS, enquête aréolaire (ADR-0034)" />
    </div>
  );
}
