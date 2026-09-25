import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { DraftsList } from "@/features/registry/enrolment/drafts-list";

export const metadata: Metadata = { title: "Enregistrements en cours" };

export default async function DraftsPage() {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/en-cours" });
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Registre"
        title="En cours"
        description="Vos enregistrements commencés, à reprendre là où vous vous êtes arrêté."
      />
      <DraftsList userId={user.id} />
    </div>
  );
}
