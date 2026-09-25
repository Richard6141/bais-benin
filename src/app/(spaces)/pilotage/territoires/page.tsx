import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import {
  filtersQuery,
  parseDashboardFilters,
  withQuery,
} from "@/features/dashboard/dashboard-logic";
import { ExportActions } from "@/features/dashboard/export-actions";
import { DemoDataBanner, ProvenanceNote, formatDataDate } from "@/features/dashboard/provenance";
import { RankingTable } from "@/features/dashboard/ranking-table";
import { getTerritoryRanking } from "@/modules/analytics";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Territoires" };

// B : départements classés (B1), puis communes d'un département (B2) quand le filtre de
// département est posé. La descente se fait par lien : l'adresse dit toujours ce qui est lu.
export default async function TerritoriesPage(props: PageProps<"/pilotage/territoires">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/territoires" });
  const filters = parseDashboardFilters(await props.searchParams);
  const level = filters.departementCode ? "commune" : "departement";

  const [ranking, campaigns, crops, departements] = await Promise.all([
    getTerritoryRanking(user.actor, { level, ...filters }),
    listCampaigns(),
    listCrops(),
    listDepartements(),
  ]);
  const departementName = departements.find((d) => d.code === filters.departementCode)?.name;
  const cropName = crops.find((c) => c.code === filters.cropCode)?.nameFr;
  const hrefFor = (row: { code: string }) =>
    level === "departement"
      ? withQuery("/pilotage/territoires", filtersQuery(filters, { departementCode: row.code }))
      : withQuery(
          `/pilotage/communes/${row.code}`,
          filtersQuery(filters, { departementCode: undefined }),
        );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={departementName ? `Communes du département ${departementName}` : "Départements"}
        description={`Campagne ${ranking.campaign.code} · données au ${formatDataDate(ranking.provenance.refreshedAt)}. Triez par colonne ; touchez une ligne pour descendre d'un niveau.`}
        actions={<ExportActions query={filtersQuery(filters)} />}
      />
      <DemoDataBanner provenance={ranking.provenance} />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={campaigns}
          crops={crops}
          departements={departements}
          defaultCampaignCode={ranking.campaign.code}
        />
      </Suspense>
      {departementName ? (
        <Button asChild variant="outline" className="h-11 self-start print:hidden">
          <Link
            href={
              withQuery(
                "/pilotage/territoires",
                filtersQuery(filters, { departementCode: undefined }),
              ) as Route
            }
          >
            Tous les départements
          </Link>
        </Button>
      ) : null}
      <section aria-label="Classement" className="flex flex-col gap-3" data-print-block>
        <RankingTable ranking={ranking} hrefFor={hrefFor} cropName={cropName} />
        <ProvenanceNote provenance={ranking.provenance} />
      </section>
    </div>
  );
}
