import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { withQuery } from "@/features/dashboard/dashboard-logic";
import {
  ProducerRankingFilters,
  ProducerRankingTable,
} from "@/features/dashboard/producer-ranking-view";
import { getProducerRanking } from "@/modules/analytics";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Palmarès des producteurs" };

// Palmarès nominatif des producteurs (ADR-0018) : ministère seulement, chaque consultation est
// journalisée. L'adresse porte les critères, l'export CSV reprend exactement le même classement.
export default async function ProducerRankingPage(props: PageProps<"/pilotage/palmares">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/palmares" });
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const input = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const [ranking, campaigns, crops, departements] = await Promise.all([
    getProducerRanking(user.actor, input),
    listCampaigns(),
    listCrops(),
    listDepartements(),
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={`Palmarès ${cropName.toLowerCase()} · campagne ${ranking.campaign.code}`}
        description={`${scope}, classement ${criterion}. ${ranking.eligibleCount} producteur${ranking.eligibleCount > 1 ? "s" : ""} classable${ranking.eligibleCount > 1 ? "s" : ""} avec ces critères. Données nominatives réservées au ministère ; chaque consultation est journalisée.`}
        actions={
          <Button asChild variant="outline" className="h-11">
            <a href={withQuery("/api/v1/analytics/producer-ranking.csv", exportQuery.toString())}>
              Exporter en CSV
            </a>
          </Button>
        }
      />
      <ProducerRankingFilters
        ranking={ranking}
        crops={crops}
        campaigns={campaigns}
        departements={departements}
      />
      <ProducerRankingTable ranking={ranking} cropName={cropName} />
    </div>
  );
}
