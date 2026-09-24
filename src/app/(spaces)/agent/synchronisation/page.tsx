import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { OutboxList } from "@/features/registry/agent/outbox-list";

export const metadata: Metadata = { title: "Synchronisation" };

export default async function SyncPage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Appareil"
        title="Synchronisation"
        description="Vos saisies partent seules au retour du réseau, dans l'ordre où vous les avez faites. Une saisie refusée reste ici jusqu'à correction."
      />
      <OutboxList userId={user.id} />
    </div>
  );
}
