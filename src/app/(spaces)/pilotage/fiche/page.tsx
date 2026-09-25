import type { Metadata, Route } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/layout/print-button";
import { PrintLayout } from "@/components/layout/print-layout";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { CropProduction } from "@/features/dashboard/crop-production";
import {
  describeFilters,
  filtersQuery,
  parseDashboardFilters,
  withQuery,
} from "@/features/dashboard/dashboard-logic";
import { AlertsSummary, DashboardSection } from "@/features/dashboard/national-sections";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner, ProvenanceNote, formatDataDate } from "@/features/dashboard/provenance";
import { getCropProduction, getDashboardOverview } from "@/modules/analytics";
import { getMonitoringOverview } from "@/modules/monitoring";
import { listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Fiche de pilotage" };

// E : fiche imprimable (A4 portrait) des filtres courants : indicateurs clés, production par
// culture, alertes, provenance en pied. Impression ou PDF par la boîte de dialogue du navigateur.
export default async function PrintSheetPage(props: PageProps<"/pilotage/fiche">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/fiche" });
  const filters = parseDashboardFilters(await props.searchParams);
  const query = filtersQuery(filters);
  const [overview, production, alerts, crops, departements] = await Promise.all([
    getDashboardOverview(user.actor, filters),
    getCropProduction(user.actor, filters),
    getMonitoringOverview(user.actor),
    listCrops(),
    listDepartements(),
  ]);
  const scope = describeFilters(
    { ...filters, campaignCode: overview.campaign.code },
    {
      crops: new Map(crops.map((c) => [c.code, c.nameFr])),
      departements: new Map(departements.map((d) => [d.code, d.name])),
    },
  );

  return (
    <PrintLayout
      title="Fiche de pilotage"
      scope={scope}
      dataDate={formatDataDate(overview.provenance.refreshedAt)}
      provenance={<ProvenanceNote provenance={overview.provenance} />}
      actions={
        <>
          <PrintButton />
          <Button asChild variant="outline" className="h-11">
            <Link href={withQuery("/pilotage", query) as Route}>Retour au tableau de bord</Link>
          </Button>
        </>
      }
    >
      <DemoDataBanner provenance={overview.provenance} />
      <OverviewTiles overview={overview} query={query} />
      <DashboardSection id="production" title="Production par culture">
        <CropProduction
          rows={production.rows}
          provenance={production.provenance}
          hrefForCrop={null}
          foldTable={false}
        />
      </DashboardSection>
      <DashboardSection id="alertes" title="Alertes en cours">
        <AlertsSummary overview={alerts} />
      </DashboardSection>
    </PrintLayout>
  );
}
