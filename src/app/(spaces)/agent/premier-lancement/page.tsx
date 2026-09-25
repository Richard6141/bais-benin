import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { FirstLaunch } from "@/features/registry/agent/first-launch";
import { scopedCommunes } from "@/modules/registry";

export const metadata: Metadata = { title: "Préparer le hors-ligne" };

export default async function FirstLaunchPage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  const scope = await scopedCommunes(user.actor);
  const communes = scope === "all" || scope === "none" ? [] : scope;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Premier lancement"
        title="Préparer le travail sans réseau"
        description="Téléchargement unique, de préférence en Wi-Fi ; l'application fonctionne ensuite sans connexion."
      />
      <FirstLaunch userId={user.id} communes={communes} />
    </div>
  );
}
