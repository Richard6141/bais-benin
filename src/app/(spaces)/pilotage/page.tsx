import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgriMap } from "@/features/agri-map/agri-map";
import { requireRole } from "@/features/auth/session";
import { CampaignBlock } from "@/features/dashboard/campaign-block";
import { CropProduction } from "@/features/dashboard/crop-production";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import {
  filtersQuery,
  parseDashboardFilters,
  withQuery,
} from "@/features/dashboard/dashboard-logic";
import { ExportActions } from "@/features/dashboard/export-actions";
import {
  AlertsSummary,
  DashboardSection,
  QualityGlance,
} from "@/features/dashboard/national-sections";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner, formatDataDate } from "@/features/dashboard/provenance";
import {
  getCampaignComparison,
  getCropProduction,
  getDashboardOverview,
  getDataQuality,
} from "@/modules/analytics";
import { getMonitoringOverview } from "@/modules/monitoring";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Centre de pilotage" };

// A : vue nationale. Lecture seule ; les filtres sont dans l'adresse, partagés avec la carte.
// requireRole("ADMIN_STATE") réserve la page au ministère (identifié par NPI, ADR-0012).
export default async function NationalDashboardPage(props: PageProps<"/pilotage">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage" });
  const filters = parseDashboardFilters(await props.searchParams);
  const query = filtersQuery(filters);
  // La comparaison porte sur plusieurs campagnes : toutes les autres dimensions du filtre.
  const withoutCampaign = {
    cropCode: filters.cropCode,
    departementCode: filters.departementCode,
    verificationStatus: filters.verificationStatus,
  };

  const [overview, production, comparison, quality, alerts, campaigns, crops, departements] =
    await Promise.all([
      getDashboardOverview(user.actor, filters),
      getCropProduction(user.actor, filters),
      getCampaignComparison(user.actor, withoutCampaign),
      getDataQuality(user.actor, { departementCode: filters.departementCode }),
      getMonitoringOverview(user.actor),
      listCampaigns(),
      listCrops(),
      listDepartements(),
    ]);
  const cropHref = (cropCode: string) =>
    withQuery("/pilotage", filtersQuery(filters, { cropCode })) + "#production";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Tableau de bord national"
        description={`Campagne ${overview.campaign.code}, données au ${formatDataDate(overview.provenance.refreshedAt)}.`}
        actions={<ExportActions query={query} />}
      />
      <DemoDataBanner provenance={overview.provenance} />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={campaigns}
          crops={crops}
          departements={departements}
          defaultCampaignCode={overview.campaign.code}
        />
      </Suspense>

      <OverviewTiles overview={overview} query={query} />

      <DashboardSection
        id="production"
        title="Production par culture"
        description={`Campagne ${production.campaign.code}. Rendement indicatif : production déclarée rapportée à la superficie récoltée déclarée.`}
      >
        <CropProduction
          rows={production.rows}
          provenance={production.provenance}
          hrefForCrop={cropHref}
        />
      </DashboardSection>

      <DashboardSection
        id="campagnes"
        title="Campagne contre campagne"
        description="Les cinq cultures principales sur les trois dernières campagnes."
      >
        <CampaignBlock data={comparison} />
      </DashboardSection>

      <DashboardSection
        id="carte"
        title="Carte des communes"
        description="Les filtres de la carte s'appliquent à toute la page. Touchez une commune pour lire ses chiffres."
      >
        <div className="h-[720px] overflow-hidden rounded-xl border print:hidden">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <AgriMap
              options={{ crops, campaigns, departements }}
              canShowFarms
              canFilterByStatus
              canSeeSkyDetail
            />
          </Suspense>
        </div>
      </DashboardSection>

      <DashboardSection
        id="alertes"
        title="Alertes en cours"
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/pilotage/alertes" as Route}>Centre d&apos;alertes</Link>
          </Button>
        }
      >
        <AlertsSummary overview={alerts} />
      </DashboardSection>

      <DashboardSection id="qualite" title="Qualité des données">
        <QualityGlance quality={quality} />
      </DashboardSection>
    </div>
  );
}
