import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import { parseDashboardFilters } from "@/features/dashboard/dashboard-logic";
import { DashboardSection } from "@/features/dashboard/national-sections";
import { formatDataDate } from "@/features/dashboard/provenance";
import {
  AgeingSection,
  CoverageSection,
  FreshnessSection,
  GapsSection,
} from "@/features/dashboard/quality-sections";
import { getDataQuality } from "@/modules/analytics";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Qualité des données" };

// D : qualité du registre, pour juger d'un chiffre avant de le citer. Des comptes et des
// communes seulement : aucun nom de producteur ni d'agent.
export default async function DataQualityPage(props: PageProps<"/pilotage/qualite">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/qualite" });
  const { departementCode } = parseDashboardFilters(await props.searchParams);
  const [quality, departements] = await Promise.all([
    getDataQuality(user.actor, { departementCode }),
    listDepartements(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Qualité des données"
        description={`Écarts, ancienneté des déclarations, couverture des agents et fraîcheur, au ${formatDataDate(quality.generatedAt)}.`}
      />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={[]}
          crops={[]}
          departements={departements}
          fields={["departementCode"]}
        />
      </Suspense>

      <DashboardSection
        id="fraicheur"
        title="Fraîcheur"
        description="Dernières données reçues et dernier calcul des agrégats."
      >
        <FreshnessSection freshness={quality.freshness} />
      </DashboardSection>

      <DashboardSection
        id="ecarts"
        title="Écarts entre déclaré et mesuré"
        description="Parcelles dont le contour a été relevé au GPS, comparées à la superficie déclarée."
      >
        <GapsSection gaps={quality.gaps} />
      </DashboardSection>

      <DashboardSection
        id="anciennete"
        title="Déclarations en attente de vérification"
        description="Exploitations encore au statut déclaré, par ancienneté depuis la déclaration."
      >
        <AgeingSection ageing={quality.ageing} />
      </DashboardSection>

      {quality.coverage ? (
        <DashboardSection
          id="couverture"
          title="Couverture des agents et doublons"
          description="Comptes seulement : aucun agent ni producteur n'est nommé."
        >
          <CoverageSection coverage={quality.coverage} duplicates={quality.duplicates} />
        </DashboardSection>
      ) : null}
    </div>
  );
}
