import type { Metadata } from "next";
import { ActionDialog } from "@/components/layout/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { withQuery } from "@/features/dashboard/dashboard-logic";
import {
  ProducerRankingFilters,
  ProducerRankingTable,
} from "@/features/dashboard/producer-ranking-view";
import {
  PublishRankingForm,
  PublishedRankingsList,
} from "@/features/dashboard/ranking-publication";
import { CreateGroupForm } from "@/features/producer-groups/create-group-form";
import { getProducerRanking } from "@/modules/analytics";
import { MAX_GROUP_NAME_LENGTH, suggestGroupName } from "@/modules/producer-groups";
import { MAX_PUBLISHED_LAUREATES, listPublishedRankings } from "@/modules/public-ranking";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Classement des producteurs" };

const shortDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});

// Classement nominatif des producteurs (ADR-0018) : ministère seulement, chaque consultation est
// journalisée. L'adresse porte les critères, l'export CSV reprend exactement le même classement.
// Le tableau d'abord ; former un groupe avec les producteurs affichés (ADR-0024) et publier un
// palmarès public (lauréats consentants seulement) sont des actions de page. Les palmarès déjà
// publiés, et leur retrait, ont leur onglet. « Palmarès » désigne ce qui est public (/palmares) ;
// ici, c'est le classement.
export default async function ProducerRankingPage(props: PageProps<"/pilotage/palmares">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/palmares" });
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const input = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const [ranking, campaigns, crops, departements, published] = await Promise.all([
    getProducerRanking(user.actor, input),
    listCampaigns(),
    listCrops(),
    listDepartements(),
    listPublishedRankings(user.actor),
  ]);
  const cropName =
    crops.find((c) => c.code === ranking.filters.cropCode)?.nameFr ?? "cette culture";
  const departementName = departements.find(
    (d) => d.code === ranking.filters.departementCode,
  )?.name;
  const exportQuery = new URLSearchParams({
    cropCode: ranking.filters.cropCode,
    campaignCode: ranking.filters.campaignCode,
    metric: ranking.filters.metric,
    verifiedOnly: ranking.filters.verifiedOnly ? "1" : "0",
    limit: String(ranking.filters.limit),
    ...(ranking.filters.departementCode
      ? { departementCode: ranking.filters.departementCode }
      : {}),
  });

  const scope = departementName ? `Département ${departementName}` : "Tout le Bénin";
  const criterion =
    ranking.filters.metric === "yield" ? "au rendement à l'hectare" : "à la production totale";

  const groupCriteria = {
    cropCode: ranking.filters.cropCode,
    campaignCode: ranking.filters.campaignCode,
    departementCode: ranking.filters.departementCode,
    communeCode: ranking.filters.communeCode,
    metric: ranking.filters.metric,
    verifiedOnly: ranking.filters.verifiedOnly,
  };
  const hasRows = ranking.rows.length > 0;
  const livePublications = published.filter((item) => !item.withdrawnAt).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={`Classement ${cropName.toLowerCase()} (campagne ${ranking.campaign.code})`}
        description={`${scope}, classement ${criterion}. ${ranking.eligibleCount} producteur${ranking.eligibleCount > 1 ? "s" : ""} classable${ranking.eligibleCount > 1 ? "s" : ""} avec ces critères. Données nominatives réservées au ministère ; chaque consultation est journalisée.`}
        actions={
          <>
            {hasRows ? (
              <ActionDialog
                label="Former un groupe"
                description="Faire des producteurs affichés un groupe nommé."
                variant="default"
                tour="former-groupe"
              >
                <CreateGroupForm
                  criteria={{ ...groupCriteria, limit: ranking.filters.limit }}
                  suggestedName={suggestGroupName({
                    cropName,
                    scopeName: departementName,
                    campaignCode: ranking.filters.campaignCode,
                    count: ranking.rows.length,
                    metric: ranking.filters.metric,
                  })}
                  count={ranking.rows.length}
                  maxNameLength={MAX_GROUP_NAME_LENGTH}
                />
              </ActionDialog>
            ) : null}
            {hasRows ? (
              <ActionDialog
                label="Publier"
                description="Publier sur la page publique les lauréats qui ont donné leur accord."
              >
                <PublishRankingForm
                  criteria={groupCriteria}
                  consenting={ranking.rows.filter((row) => row.publicConsent).length}
                  max={MAX_PUBLISHED_LAUREATES}
                />
              </ActionDialog>
            ) : null}
            <Button asChild variant="outline" className="h-11">
              <a href={withQuery("/api/v1/analytics/producer-ranking.csv", exportQuery.toString())}>
                Exporter en CSV
              </a>
            </Button>
          </>
        }
      />
      <PageTabs
        label="Classement et palmarès publiés"
        initial={typeof params.onglet === "string" ? params.onglet : null}
        tabs={[
          {
            value: "classement",
            label: "Classement",
            content: (
              <>
                <ProducerRankingFilters
                  ranking={ranking}
                  crops={crops}
                  campaigns={campaigns}
                  departements={departements}
                />
                <ProducerRankingTable ranking={ranking} cropName={cropName} />
              </>
            ),
          },
          {
            value: "publies",
            label: "Palmarès publiés",
            count: livePublications,
            content: (
              <PublishedRankingsList
                rows={published.map((item) => ({
                  id: item.id,
                  title: item.title,
                  publishedOn: shortDate.format(item.publishedAt),
                  publishedByName: item.publishedByName,
                  withdrawnOn: item.withdrawnAt ? shortDate.format(item.withdrawnAt) : null,
                  laureates: item.laureates,
                }))}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
