import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/layout/site-header";
import { AgriMap } from "@/features/agri-map/agri-map";
import { getCurrentUser } from "@/features/auth/session";
import { canFilterByStatus } from "@/modules/analytics";
import { can, scopeFilter } from "@/modules/authorization";
import { listCampaigns, listCrops } from "@/modules/registry";
import { listDepartements } from "@/modules/territory";

export const metadata: Metadata = {
  title: "Carte agricole",
  description:
    "Exploitations, cultures et vérifications par commune, sur l'ensemble du territoire.",
};

export const dynamic = "force-dynamic";

// La carte est publique au niveau des agrégats communaux. Les points d'exploitations
// individuels ne sont proposés qu'aux rôles habilités à lire le registre.
export default async function MapPage() {
  const [crops, campaigns, departements, user] = await Promise.all([
    listCrops(),
    listCampaigns(),
    listDepartements(),
    getCurrentUser(),
  ]);
  const canShowFarms = user
    ? can(user.actor, "farm.read", {}) || user.actor.grants.some((g) => g.scopeType !== "SELF")
    : false;
  // Contours et fiches des parcelles : tout compte qui lit une part du registre (les tuiles et la
  // fiche appliquent ensuite sa portée : pays, ses enregistrements ou ses propres parcelles).
  const canInspectParcels = user ? scopeFilter(user.actor, "farm.read").kind !== "none" : false;
  const isAgent = user?.actor.grants.some((grant) => grant.role === "AGENT_AGRICULTURE") ?? false;

  return (
    <>
      <SiteHeader />
      {/* Plein écran exact, quels que soient l'en-tête et le bandeau hors connexion : la page
          prend la hauteur de la fenêtre (globals.css, data-fill-viewport) et la carte le reste. */}
      <main data-fill-viewport className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <AgriMap
            options={{
              crops,
              campaigns,
              departements: departements.map((d) => ({ code: d.code, name: d.name })),
            }}
            canShowFarms={canShowFarms}
            canFilterByStatus={canFilterByStatus(user?.actor ?? null)}
            canInspectParcels={canInspectParcels}
            farmHrefBase={isAgent ? "/agent/exploitations" : undefined}
            canAttributeFields={isAgent}
            userId={isAgent ? user?.id : undefined}
            canSeeSkyDetail={
              // Tuiles satellite détaillées : agents et ministère seulement (revue R2).
              user?.actor.grants.some(
                (grant) => grant.role === "AGENT_AGRICULTURE" || grant.role === "ADMIN_STATE",
              ) ?? false
            }
          />
        </Suspense>
      </main>
    </>
  );
}
