import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RequestForm } from "@/features/assistance/request-form";
import { requireRole } from "@/features/auth/session";
import { PendingReports } from "@/features/reports/pending-reports";
import { assistanceFormContext } from "@/modules/assistance";

export const metadata: Metadata = { title: "Solliciter l'État" };

// Demande d'assistance du producteur (phase 0) : routée vers les agents de sa commune.
export default async function FarmerAssistancePage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/solliciter" });
  const context = await assistanceFormContext(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agriculteur"
        title="Solliciter l'État"
        description="Conseil, intrants, litige, sinistre : votre demande est transmise aux agents de votre commune, qui vous répondent ici."
        actions={
          <Button asChild variant="outline">
            <Link href="/agriculteur/demandes">Mes demandes</Link>
          </Button>
        }
      />
      <PendingReports userId={user.id} />
      <RequestForm userId={user.id} context={context} />
    </div>
  );
}
