import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { WatchCentre } from "@/features/watch/watch-centre";
import { getWatchSummary } from "@/modules/watch";

export const metadata: Metadata = { title: "Centre de veille" };
export const dynamic = "force-dynamic";

// Centre de veille du ministère (ADR-0022) : feux, alertes, foyers à confirmer, demandes et
// fraîcheur des sources, relus automatiquement par la page.
export default async function WatchCentrePage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/veille" });
  const summary = await getWatchSummary(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Centre de veille"
        description="La situation du pays en temps réel : feux de brousse, alertes, foyers de signalements et demandes d'assistance."
      />
      <WatchCentre initial={summary} />
    </div>
  );
}
