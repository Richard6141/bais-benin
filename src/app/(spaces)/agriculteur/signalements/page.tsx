import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { PendingReports } from "@/features/reports/pending-reports";
import { ReportList } from "@/features/reports/report-list";
import { listReportsForActor } from "@/modules/reports";

export const metadata: Metadata = { title: "Mes signalements" };

// Signalements du producteur et suite donnée par l'agent. Un signalement encore dans la file du
// téléphone (hors ligne) n'apparaît ici qu'une fois envoyé.
export default async function FarmerReportsPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/signalements" });
  const reports = await listReportsForActor(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agriculteur"
        title="Mes signalements"
        actions={
          <Button asChild>
            <Link href="/agriculteur/signaler">Signaler un problème</Link>
          </Button>
        }
      />
      <PendingReports userId={user.id} />
      <ReportList reports={reports} showFarmer={false} empty="Vous n'avez encore rien signalé." />
    </div>
  );
}
