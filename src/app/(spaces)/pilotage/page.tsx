import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MonitorPlay } from "lucide-react";
import { ActionList } from "@/components/layout/action-list";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
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
import { ministryMoment } from "@/features/dashboard/ministry-moment";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner, formatDataDate } from "@/features/dashboard/provenance";
import {
  getCampaignComparison,
  getCropProduction,
  getDashboardOverview,
  getDataQuality,
} from "@/modules/analytics";
import { LiveActivityFeed } from "@/features/live/live-activity-feed";
import { getMonitoringOverview } from "@/modules/monitoring";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";
import { getWatchSummary } from "@/modules/watch";

export const metadata: Metadata = { title: "Centre de pilotage" };

// A : accueil du ministère. La situation du jour en une phrase, les actions du moment et le fil
// d'activité en direct, puis quatre chiffres clés et une vue à la fois (production, campagnes,
// carte, alertes, qualité) : l'essentiel tient dans un écran, le reste est à un onglet. Les
// filtres sont dans l'adresse, partagés avec la carte. requireRole("ADMIN_STATE") réserve la page
// au ministère (identifié par NPI, ADR-0012).
export default async function NationalDashboardPage(props: PageProps<"/pilotage">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage" });
  const search = await props.searchParams;
  const filters = parseDashboardFilters(search);
  const query = filtersQuery(filters);
  // La comparaison porte sur plusieurs campagnes : toutes les autres dimensions du filtre.
  const withoutCampaign = {
    cropCode: filters.cropCode,
    departementCode: filters.departementCode,
    verificationStatus: filters.verificationStatus,
  };

  const [overview, production, comparison, quality, alerts, campaigns, crops, departements, watch] =
    await Promise.all([
      getDashboardOverview(user.actor, filters),
      getCropProduction(user.actor, filters),
      getCampaignComparison(user.actor, withoutCampaign),
      getDataQuality(user.actor, { departementCode: filters.departementCode }),
      getMonitoringOverview(user.actor),
      listCampaigns(),
      listCrops(),
      listDepartements(),
      getWatchSummary(user.actor),
    ]);
  const moment = ministryMoment(watch);
  const cropHref = (cropCode: string) =>
    withQuery("/pilotage", filtersQuery(filters, { cropCode }));
  const s = alerts.activeBySeverity;
  const activeAlerts = s.CRITICAL + s.WARNING + s.WATCH + s.INFO;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Tableau de bord national"
        description={`${moment.sentence} Campagne ${overview.campaign.code}, données au ${formatDataDate(overview.provenance.refreshedAt)}.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-11">
              <Link href={"/salle-de-situation" as Route}>
                <MonitorPlay aria-hidden />
                Salle de situation
              </Link>
            </Button>
            <ExportActions query={query} />
          </>
        }
      />
      <DemoDataBanner provenance={overview.provenance} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <ActionList
          actions={moment.actions}
          idle="Rien d'urgent : aucune alerte grave, aucun feu, aucune demande en attente."
        />
        <LiveActivityFeed maxItems={6} />
      </div>
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={campaigns}
          crops={crops}
          departements={departements}
          defaultCampaignCode={overview.campaign.code}
        />
      </Suspense>

      <OverviewTiles
        overview={overview}
        query={query}
        only={["producteurs", "exploitations", "declaree", "mesuree"]}
      />

      <PageTabs
        label="Vues du tableau de bord"
        initial={typeof search.onglet === "string" ? search.onglet : null}
        tabs={[
          {
            value: "production",
            label: "Production",
            content: (
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
            ),
          },
          {
            value: "campagnes",
            label: "Campagnes",
            content: (
              <DashboardSection
                id="campagnes"
                title="Campagne contre campagne"
                description="Les cinq cultures principales sur les trois dernières campagnes."
              >
                <CampaignBlock data={comparison} />
              </DashboardSection>
            ),
          },
          {
            value: "carte",
            label: "Carte",
            content: (
              <DashboardSection
                id="carte"
                title="Carte des communes"
                description="Les filtres de la carte s'appliquent à toute la page. Touchez une commune pour lire ses chiffres."
              >
                <div className="h-[75svh] min-h-[480px] overflow-hidden rounded-lg border lg:h-[720px] print:hidden">
                  <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                    <AgriMap
                      options={{ crops, campaigns, departements }}
                      canShowFarms
                      canFilterByStatus
                      canSeeSkyDetail
                      canInspectParcels
                    />
                  </Suspense>
                </div>
              </DashboardSection>
            ),
          },
          {
            value: "alertes",
            label: "Alertes",
            count: activeAlerts,
            content: (
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
            ),
          },
          {
            value: "qualite",
            label: "Qualité",
            content: (
              <DashboardSection id="qualite" title="Qualité des données">
                <QualityGlance quality={quality} />
              </DashboardSection>
            ),
          },
        ]}
      />
    </div>
  );
}
