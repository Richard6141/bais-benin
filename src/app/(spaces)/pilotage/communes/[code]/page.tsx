import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import {
  CommuneComparison,
  FieldCoverageSection,
  WeatherAndAlerts,
} from "@/features/dashboard/commune-sections";
import { CropProduction } from "@/features/dashboard/crop-production";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import {
  filtersQuery,
  parseDashboardFilters,
  withQuery,
} from "@/features/dashboard/dashboard-logic";
import { ExportActions } from "@/features/dashboard/export-actions";
import { DashboardSection } from "@/features/dashboard/national-sections";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner, formatDataDate } from "@/features/dashboard/provenance";
import { AnalyticsError, getCommuneProfile } from "@/modules/analytics";
import { getCommuneWeather, listAlertsForActor } from "@/modules/monitoring";
import { listCampaigns, listCrops } from "@/modules/registry";

export const metadata: Metadata = { title: "Fiche commune" };

async function loadProfile(...args: Parameters<typeof getCommuneProfile>) {
  try {
    return await getCommuneProfile(...args);
  } catch (error) {
    if (error instanceof AnalyticsError && error.code !== "FORBIDDEN") notFound();
    throw error;
  }
}

// C : fiche d'une commune. Mêmes indicateurs que la vue nationale au grain commune, comparés au
// département et au pays, puis cultures, couverture terrain, météo et alertes.
export default async function CommuneProfilePage(props: PageProps<"/pilotage/communes/[code]">) {
  const { code } = await props.params;
  if (!/^BJ-[A-Z]{3}-\d{3}$/.test(code)) notFound();
  const user = await requireRole("ADMIN_STATE", { returnTo: `/pilotage/communes/${code}` });
  const filters = parseDashboardFilters(await props.searchParams);
  // La commune fixe le territoire : un filtre de département resté dans l'adresse est ignoré.
  const scoped = { ...filters, departementCode: undefined };

  const [profile, weather, alerts, campaigns, crops] = await Promise.all([
    loadProfile(user.actor, code, scoped),
    getCommuneWeather(code),
    listAlertsForActor(user.actor, { status: "ACTIVE", communeCode: code, limit: 20 }),
    listCampaigns(),
    listCrops(),
  ]);
  const { commune } = profile;
  const query = filtersQuery(scoped);
  const back = withQuery(
    "/pilotage/territoires",
    filtersQuery(scoped, { departementCode: commune.departementCode }),
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={`Département ${commune.departementName}`}
        title={commune.name}
        description={`Campagne ${profile.campaign.code} · données au ${formatDataDate(profile.provenance.refreshedAt)}.`}
        actions={<ExportActions query={query} communeCode={commune.code} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        {commune.zoneCode ? (
          <Badge variant="outline">
            {commune.zoneCode}
            {commune.zoneName ? ` · ${commune.zoneName}` : ""}
          </Badge>
        ) : null}
        <Button asChild variant="outline" className="h-11 print:hidden">
          <Link href={back as Route}>Communes du département</Link>
        </Button>
      </div>
      <DemoDataBanner provenance={profile.provenance} />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={campaigns}
          crops={crops}
          departements={[]}
          defaultCampaignCode={profile.campaign.code}
          fields={["campaignCode", "cropCode", "verificationStatus"]}
        />
      </Suspense>

      <DashboardSection id="chiffres" title="Chiffres de la commune">
        <OverviewTiles
          overview={{ figures: profile.figures, previous: null, provenance: profile.provenance }}
          query={query}
        />
        <CommuneComparison profile={profile} />
      </DashboardSection>

      <DashboardSection id="cultures" title="Cultures">
        <CropProduction rows={profile.crops} provenance={profile.provenance} hrefForCrop={null} />
      </DashboardSection>

      <DashboardSection id="terrain" title="Couverture terrain">
        <FieldCoverageSection profile={profile} />
      </DashboardSection>

      <DashboardSection id="meteo" title="Météo et alertes">
        <WeatherAndAlerts weather={weather} alerts={alerts} />
      </DashboardSection>
    </div>
  );
}
