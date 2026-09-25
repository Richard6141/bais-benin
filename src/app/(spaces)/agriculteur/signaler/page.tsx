import type { Metadata } from "next";
import Link from "next/link";
import { CROP_GLYPH_LABELS } from "@/components/data-display/crop-glyph";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { PendingReports } from "@/features/reports/pending-reports";
import { ReportForm } from "@/features/reports/report-form";
import { listReportableFarms } from "@/modules/reports";

export const metadata: Metadata = { title: "Signaler un problème" };

// Signalement d'un ravageur, d'une maladie ou d'un autre problème sur une parcelle (phase 0).
export default async function FarmerReportPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/signaler" });
  const farms = await listReportableFarms(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agriculteur"
        title="Signaler un problème"
        description="Ravageur, maladie des cultures ou des animaux : l'agent de votre commune est prévenu et vient constater. Plusieurs signalements proches aident à repérer une épidémie à temps."
        actions={
          <Button asChild variant="outline">
            <Link href="/agriculteur/signalements">Mes signalements</Link>
          </Button>
        }
      />
      <PendingReports userId={user.id} />
      <ReportForm userId={user.id} farms={farms} cropNames={CROP_GLYPH_LABELS} />
    </div>
  );
}
