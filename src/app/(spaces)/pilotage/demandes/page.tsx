import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AssistanceStatsTable } from "@/features/assistance/stats-table";
import { requireRole } from "@/features/auth/session";
import { assistanceStats } from "@/modules/assistance";

export const metadata: Metadata = { title: "Demandes d'assistance" };

// Volumes et délais des demandes « Solliciter l'État » par commune : le ministère suit la réponse
// de ses agents sans lire les demandes elles-mêmes (agrégats, secret statistique à 5).
export default async function PilotageAssistancePage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/demandes" });
  const stats = await assistanceStats(user.actor);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Demandes d'assistance"
        description="Combien de producteurs sollicitent l'État, sur quoi, et en combien de temps les agents répondent, commune par commune, sur les 90 derniers jours."
      />
      <AssistanceStatsTable stats={stats} />
    </div>
  );
}
