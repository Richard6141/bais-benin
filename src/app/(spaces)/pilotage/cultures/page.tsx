import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import { DashboardFiltersBar } from "@/features/dashboard/dashboard-filters";
import { parseDashboardFilters } from "@/features/dashboard/dashboard-logic";
import { CropAreaSection, cropClassLabel } from "@/features/satellite/crop-area-section";
import { CULTIVATED_CLASSES, getCropAreaComparison } from "@/modules/satellite";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Surfaces par satellite" };

// Surfaces cultivées vues par satellite, face au registre (ADR-0021) : le ministère voit depuis
// son bureau ce qui est cultivé par culture et par zone, le taux d'enrôlement, et les communes
// où envoyer les agents vérifier. Des hectares par commune, aucun producteur.
export default async function CropAreasPage(props: PageProps<"/pilotage/cultures">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/cultures" });
  const { departementCode, cropCode } = parseDashboardFilters(await props.searchParams);
  const [comparison, departements] = await Promise.all([
    getCropAreaComparison(user.actor, { departementCode, cropClass: cropCode }),
    listDepartements(),
  ]);

  return (
    <div className="flex flex-col gap-8">
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
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <DashboardFiltersBar
          campaigns={[]}
          crops={CULTIVATED_CLASSES.map((code) => ({ code, nameFr: cropClassLabel(code) }))}
          departements={departements}
          fields={["cropCode", "departementCode"]}
        />
      </Suspense>
      {comparison ? <CropAreaSection comparison={comparison} /> : null}
    </div>
  );
}
