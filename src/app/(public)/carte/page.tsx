import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/layout/site-header";
import { AgriMap } from "@/features/agri-map/agri-map";
import { getCurrentUser } from "@/features/auth/session";
import { canFilterByStatus } from "@/modules/analytics";
import { can } from "@/modules/authorization";
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

  return (
    <>
      <SiteHeader />
      <main className="flex h-[calc(100svh-4rem)] flex-col">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <AgriMap
            options={{
              crops,
              campaigns,
              departements: departements.map((d) => ({ code: d.code, name: d.name })),
            }}
            canShowFarms={canShowFarms}
            canFilterByStatus={canFilterByStatus(user?.actor ?? null)}
            canSeeSkyDetail={user !== null}
          />
        </Suspense>
      </main>
    </>
  );
}
