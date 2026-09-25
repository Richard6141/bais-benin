import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { AffectedFarms } from "@/features/monitoring/affected-farms";
import { AlertDetailView } from "@/features/monitoring/alert-detail";
import { getAlertDetail } from "@/modules/monitoring";
import { listAffectedFarms } from "@/modules/monitoring/delivery";

export const metadata: Metadata = { title: "Alerte" };

// Fiche agent : l'alerte, sa diffusion par canal, puis les exploitations à prévenir (B2) avec le relais oral.
export default async function AgentAlertPage(props: PageProps<"/agent/alertes/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: `/agent/alertes/${id}` });
  const alert = /^[0-9a-f-]{36}$/i.test(id) ? await getAlertDetail(user.actor, id) : null;
  if (!alert) notFound();
  const farms = await listAffectedFarms(user.actor, alert.id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <AlertDetailView
        alert={alert}
        farmsSlot={<AffectedFarms farms={farms} alertId={alert.id} userId={user.id} />}
      />
      <Button asChild variant="outline" className="h-12 self-start">
        <Link href="/agent/alertes">Toutes les alertes</Link>
      </Button>
    </div>
  );
}
