import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DashboardSection } from "@/features/dashboard/national-sections";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner, formatDataDate } from "@/features/dashboard/provenance";
import { AgeingSection, GapsSection } from "@/features/dashboard/quality-sections";
import {
  getCampaignComparison,
  getCropProduction,
  getDashboardOverview,
  getDataQuality,
} from "@/modules/analytics";
import { listCampaigns, listCrops, scopedCommunes } from "@/modules/registry";

export const metadata: Metadata = { title: "Tableau de bord de mon périmètre" };

// Version réduite du tableau de bord (pilotage-parcours-ux §2.F) : les indicateurs des seules
// communes de l'agent. Les services appliquent le périmètre et le secret statistique ; pas de
// classement national ni de comparaison avec d'autres communes nommées. Quatre chiffres, puis un
// volet à la fois : les déclarations à vérifier d'abord, le travail de l'agent.
export default async function AgentDashboardPage(props: PageProps<"/agent/tableau-de-bord">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/tableau-de-bord" });
  const search = await props.searchParams;
  const params = parseDashboardFilters(search);
  // Le territoire est celui de l'agent : un filtre de département dans l'adresse est ignoré.
  const filters = { ...params, departementCode: undefined };
  const query = filtersQuery(filters);

  const [overview, production, comparison, quality, campaigns, crops, scope] = await Promise.all([
    getDashboardOverview(user.actor, filters),
    getCropProduction(user.actor, filters),
    getCampaignComparison(user.actor, {
      cropCode: filters.cropCode,
      verificationStatus: filters.verificationStatus,
    }),
    getDataQuality(user.actor, {}),
    listCampaigns(),
    listCrops(),
    scopedCommunes(user.actor),
  ]);
  const communes = Array.isArray(scope) ? scope.map((c) => c.name).join(", ") : "votre périmètre";
  // Le lien d'une culture filtre la page et rouvre l'onglet de la production.
  const cropHref = (cropCode: string) =>
    withQuery(
      "/agent/tableau-de-bord",
      [filtersQuery(filters, { cropCode }), "onglet=production"].join("&"),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title="Tableau de bord de mon périmètre"
        description={`${communes}, campagne ${overview.campaign.code}, données au ${formatDataDate(overview.provenance.refreshedAt)}.`}
        actions={<ExportActions query={query} withPrintSheet={false} />}
      />
      <DemoDataBanner provenance={overview.provenance} />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={campaigns}
          crops={crops}
          departements={[]}
          defaultCampaignCode={overview.campaign.code}
          fields={["campaignCode", "cropCode", "verificationStatus"]}
        />
      </Suspense>

      <OverviewTiles
        overview={overview}
        query={query}
        linked={false}
        only={["producteurs", "exploitations", "declaree", "mesuree"]}
      />

      <PageTabs
        label="Volets du tableau de bord"
        initial={typeof search.onglet === "string" ? search.onglet : null}
        tabs={[
          {
            value: "verification",
            label: "À vérifier",
            content: (
              <DashboardSection
                id="verification"
                title="Déclarations à vérifier"
                description="Exploitations de vos communes encore au statut déclaré, par ancienneté."
                action={
                  <Button asChild variant="outline" className="h-11">
                    <Link href={"/agent/verification" as Route}>
                      Ouvrir la file de vérification
                    </Link>
                  </Button>
                }
              >
                <AgeingSection ageing={quality.ageing} communeHref={null} />
              </DashboardSection>
            ),
          },
          {
            value: "production",
            label: "Production",
            content: (
              <DashboardSection id="production" title="Production par culture">
                <CropProduction
                  rows={production.rows}
                  provenance={production.provenance}
                  hrefForCrop={cropHref}
                />
              </DashboardSection>
            ),
          },
          {
            value: "ecarts",
            label: "Écarts",
            content: (
              <DashboardSection
                id="ecarts"
                title="Écarts entre déclaré et mesuré"
                description="Parcelles de vos communes relevées au GPS, comparées à la superficie déclarée."
              >
                <GapsSection gaps={quality.gaps} communeHref={null} />
              </DashboardSection>
            ),
          },
          {
            value: "campagnes",
            label: "Campagnes",
            content: (
              <DashboardSection id="campagnes" title="Campagne contre campagne">
                <CampaignBlock data={comparison} />
              </DashboardSection>
            ),
          },
        ]}
      />
    </div>
  );
}
