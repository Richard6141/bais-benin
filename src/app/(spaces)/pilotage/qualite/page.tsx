import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
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
import { ParcelOverlapsSection } from "@/features/dashboard/parcel-overlaps-section";
import { VegetationSection } from "@/features/satellite/vegetation-section";
import { getDataQuality } from "@/modules/analytics";
import { listParcelOverlaps } from "@/modules/registry";
import { getVegetationSummary } from "@/modules/satellite";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Qualité des données" };

// D : qualité du registre, pour juger d'un chiffre avant de le citer. Des comptes et des
// communes, plus les codes des parcelles qui se recouvrent : aucun nom de producteur ni d'agent.
// Un volet à la fois (écarts d'abord, le plus cité), au lieu de six sections empilées.
export default async function DataQualityPage(props: PageProps<"/pilotage/qualite">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/qualite" });
  const search = await props.searchParams;
  const { departementCode } = parseDashboardFilters(search);
  const [quality, departements, overlaps, vegetation] = await Promise.all([
    getDataQuality(user.actor, { departementCode }),
    listDepartements(),
    listParcelOverlaps(user.actor, { departementCode }),
    getVegetationSummary(user.actor, { departementCode }),
  ]);

  return (
    <div className="flex flex-col gap-6">
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

      <PageTabs
        label="Volets de la qualité des données"
        initial={typeof search.onglet === "string" ? search.onglet : null}
        tabs={[
          {
            value: "ecarts",
            label: "Écarts",
            content: (
              <DashboardSection
                id="ecarts"
                title="Écarts entre déclaré et mesuré"
                description="Parcelles dont le contour a été relevé au GPS, comparées à la superficie déclarée."
              >
                <GapsSection gaps={quality.gaps} />
              </DashboardSection>
            ),
          },
          ...(vegetation
            ? [
                {
                  value: "satellite",
                  label: "Satellite",
                  content: (
                    <DashboardSection
                      id="satellite"
                      title="Confrontation déclaration / satellite"
                      description="Végétation observée par Sentinel-2 sur chaque parcelle relevée, face à la culture déclarée."
                    >
                      <VegetationSection summary={vegetation} />
                    </DashboardSection>
                  ),
                },
              ]
            : []),
          {
            value: "attente",
            label: "En attente",
            content: (
              <DashboardSection
                id="anciennete"
                title="Déclarations en attente de vérification"
                description="Exploitations encore au statut déclaré, par ancienneté depuis la déclaration."
              >
                <AgeingSection ageing={quality.ageing} />
              </DashboardSection>
            ),
          },
          ...(overlaps
            ? [
                {
                  value: "chevauchements",
                  label: "Chevauchements",
                  content: (
                    <DashboardSection
                      id="chevauchements"
                      title="Chevauchements de parcelles"
                      description="Contours relevés qui se recouvrent : doublon, erreur de relevé ou conflit foncier, à vérifier sur place."
                    >
                      <ParcelOverlapsSection overlaps={overlaps} />
                    </DashboardSection>
                  ),
                },
              ]
            : []),
          ...(quality.coverage
            ? [
                {
                  value: "agents",
                  label: "Agents et doublons",
                  content: (
                    <DashboardSection
                      id="couverture"
                      title="Couverture des agents et doublons"
                      description="Comptes seulement : aucun agent ni producteur n'est nommé."
                    >
                      <CoverageSection
                        coverage={quality.coverage}
                        duplicates={quality.duplicates}
                      />
                    </DashboardSection>
                  ),
                },
              ]
            : []),
          {
            value: "fraicheur",
            label: "Fraîcheur",
            content: (
              <DashboardSection
                id="fraicheur"
                title="Fraîcheur"
                description="Dernières données reçues et dernier calcul des agrégats."
              >
                <FreshnessSection freshness={quality.freshness} />
              </DashboardSection>
            ),
          },
        ]}
      />
    </div>
  );
}
