import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RequestList } from "@/features/assistance/request-list";
import { requireRole } from "@/features/auth/session";
import { PendingReports } from "@/features/reports/pending-reports";
import { listAssistanceForActor } from "@/modules/assistance";

export const metadata: Metadata = { title: "Mes demandes" };

// Suivi des demandes du producteur : reçue, prise en charge, résolue avec la réponse de l'agent.
export default async function FarmerRequestsPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/demandes" });
  const requests = await listAssistanceForActor(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agriculteur"
        title="Mes demandes"
        actions={
          <Button asChild>
            <Link href="/agriculteur/solliciter">Nouvelle demande</Link>
          </Button>
        }
      />
      <PendingReports userId={user.id} />
      <RequestList requests={requests} empty="Vous n'avez encore rien demandé." />
    </div>
  );
}
