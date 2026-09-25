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
        description="Les saisies sont envoyées automatiquement au retour du réseau, dans l'ordre de saisie. Une saisie refusée reste ici jusqu'à sa correction."
      />
      <OutboxList userId={user.id} />
    </div>
  );
}
