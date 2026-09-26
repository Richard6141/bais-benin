import { FileSearch, Link2Off, MapPinned } from "lucide-react";
import type { Metadata, Route } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { ActionList } from "@/components/layout/action-list";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { CropProduction } from "@/features/dashboard/crop-production";
import { DashboardSection } from "@/features/dashboard/national-sections";
import { OverviewTiles } from "@/features/dashboard/overview-tiles";
import { DemoDataBanner } from "@/features/dashboard/provenance";
import { AnalyticsError, getCropProduction, getDashboardOverview } from "@/modules/analytics";

export const metadata: Metadata = { title: "Espace coopérative" };

type Actor = Awaited<ReturnType<typeof requireRole>>["actor"];

// Périmètre vide (organisation pas encore reliée à des exploitations) ou lecture refusée : les
// deux se lisent de la même façon pour la coopérative, un état vide explicite.
async function loadFigures(actor: Actor) {
  try {
    const [overview, production] = await Promise.all([
      getDashboardOverview(actor, {}),
      getCropProduction(actor, {}),
    ]);
    const empty = !overview.figures.masked && !overview.figures.farmCount;
    return empty ? null : { overview, production };
  } catch (error) {
    if (error instanceof AnalyticsError && error.code === "FORBIDDEN") return null;
    throw error;
  }
}

// Espace coopérative (pilotage-parcours-ux §2.F) : indicateurs et production par culture de ses
// membres, même seuil de 5 exploitations, sans carte nationale. Tant que le registre ne relie
// pas les exploitations aux organisations, l'espace le dit clairement plutôt que d'afficher des
// zéros.
export default async function CooperativeSpacePage() {
  const user = await requireRole("COOPERATIVE", { returnTo: "/cooperative" });
  const data = await loadFigures(user.actor);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace coopérative"
        title={`Bienvenue, ${user.name}`}
        description="Les indicateurs et la production agrégée des exploitations de vos membres."
      />
      {data ? (
        <>
          <DemoDataBanner provenance={data.overview.provenance} />
          <OverviewTiles
            overview={data.overview}
            query=""
            linked={false}
            only={["producteurs", "exploitations", "declaree", "production"]}
          />
          <DashboardSection id="production" title="Production par culture">
            <CropProduction
              rows={data.production.rows}
              provenance={data.production.provenance}
              hrefForCrop={null}
            />
          </DashboardSection>
        </>
      ) : (
        <EmptyState
          icon={<Link2Off />}
          title="Votre organisation n'est pas encore rattachée à des exploitations"
          description="Dès que les exploitations de vos membres seront reliées à la coopérative dans le registre, leurs indicateurs et leur production agrégée apparaîtront ici, sans jamais détailler un producteur."
        />
      )}
      <ActionList
        title="Ce que vous pouvez faire aujourd'hui"
        idle=""
        actions={[
          {
            href: "/carte?metric=declaredAreaHa" as Route,
            icon: MapPinned,
            title: "Voir la production de votre zone",
            detail:
              "La carte agricole, filtrée par culture : surfaces et exploitations par commune.",
          },
          {
            href: "/verifier" as Route,
            icon: FileSearch,
            title: "Vérifier l'attestation d'un membre",
            detail: "Le numéro inscrit sur l'attestation dit si elle est authentique et à jour.",
          },
        ]}
      />
    </div>
  );
}
