import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, type PageTab } from "@/components/layout/page-tabs";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import { parseDashboardFilters } from "@/features/dashboard/dashboard-logic";
import { DashboardSection } from "@/features/dashboard/national-sections";
import { CropAccuracySection } from "@/features/satellite/crop-accuracy-section";
import { CropAreaSection, cropClassLabel } from "@/features/satellite/crop-area-section";
import { ParcelCropAreaSection, ParcelCropSection } from "@/features/satellite/parcel-crop-section";
import {
  CROP_MAP_CALIBRATED,
  CULTIVATED_CLASSES,
  getCropAreaComparison,
  getCropMapAccuracy,
  getParcelCropOverview,
} from "@/modules/satellite";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Surfaces par satellite" };

// Surfaces cultivées vues par satellite, face au registre (ADR-0021) : le ministère voit depuis
// son bureau ce qui est cultivé par culture et par zone, le taux d'enrôlement, et les communes
// où envoyer les agents vérifier. Des hectares par commune, aucun producteur. Dans les communes
// pilotes, la culture mesurée parcelle par parcelle (ADR-0030 à 0032) : sa précision sur une
// commune jamais vue, l'accord avec les déclarations et les surfaces qui en découlent. Un volet à
// la fois : surfaces d'abord, le plus cité.
export default async function CropAreasPage(props: PageProps<"/pilotage/cultures">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/cultures" });
  const search = await props.searchParams;
  const { departementCode, cropCode } = parseDashboardFilters(search);
  const [comparison, accuracy, parcelCrops, departements] = await Promise.all([
    getCropAreaComparison(user.actor, { departementCode, cropClass: cropCode }),
    getCropMapAccuracy(user.actor),
    getParcelCropOverview(user.actor),
    listDepartements(),
  ]);

  const tabs: PageTab[] = [];
  if (comparison) {
    tabs.push({
      value: "surfaces",
      label: "Surfaces",
      content: <CropAreaSection comparison={comparison} />,
    });
  }
  if (accuracy) {
    tabs.push({
      value: "precision",
      label: "Précision de la carte",
      content: (
        <DashboardSection
          id="precision"
          title="Précision de la carte"
          description="Parcelles des exploitations vérifiées, culture déclarée face à la classe vue."
        >
          <CropAccuracySection accuracy={accuracy} />
        </DashboardSection>
      ),
    });
  }
  if (parcelCrops) {
    tabs.push(
      {
        value: "parcelles",
        label: "Par parcelle",
        count: parcelCrops.agreement.differs,
        content: (
          <DashboardSection
            id="parcelles"
            title="Cultures mesurées par parcelle"
            description={`Communes pilotes, campagne ${parcelCrops.campaignCode} : la culture vue sur le contour de chaque parcelle, face à la déclaration.`}
          >
            <ParcelCropSection overview={parcelCrops} />
          </DashboardSection>
        ),
      },
      {
        value: "surfaces-parcelles",
        label: "Surfaces par parcelle",
        content: (
          <DashboardSection
            id="surfaces-parcelles"
            title="Surfaces mesurées par parcelle"
            description="Surfaces par culture des parcelles mesurées, face à la carte des pixels."
          >
            <ParcelCropAreaSection overview={parcelCrops} />
          </DashboardSection>
        ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Surfaces par satellite"
        description={
          comparison
            ? `Surfaces cultivées vues par Sentinel-2 face au registre, campagne ${comparison.campaignCode}.`
            : "Aucune campagne ouverte."
        }
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/carte?ciel=cultures" as Route}>Carte des cultures</Link>
          </Button>
        }
      />
      {CROP_MAP_CALIBRATED ? null : (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertTitle className="line-clamp-none">
            Surfaces en cours de calibrage, probablement surestimées : à ne pas citer
          </AlertTitle>
        </Alert>
      )}
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={[]}
          crops={CULTIVATED_CLASSES.map((code) => ({ code, nameFr: cropClassLabel(code) }))}
          departements={departements}
          fields={["cropCode", "departementCode"]}
        />
      </Suspense>
      <PageTabs
        label="Volets des surfaces par satellite"
        initial={typeof search.onglet === "string" ? search.onglet : null}
        tabs={tabs}
      />
    </div>
  );
}
