import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { AgentAlertTabs } from "@/features/monitoring/agent-alert-tabs";
import { AlertLinkList } from "@/features/monitoring/alert-views";
import { unreadCount } from "@/features/monitoring/monitoring-logic";
import { listAlertsForActor, type AlertListItem } from "@/modules/monitoring";

export const metadata: Metadata = { title: "Alertes de mes communes" };

function AlertList({ alerts, empty }: { alerts: AlertListItem[]; empty: string }) {
  if (alerts.length === 0) {
    return <EmptyState icon={<ShieldCheck />} title={empty} />;
  }
  return (
    <AlertLinkList
      alerts={alerts}
      variant="compact"
      label="Alertes"
      hrefFor={(alert) => `/agent/alertes/${alert.id}`}
    />
  );
}

// B1 : alertes des communes du périmètre, les plus graves puis les plus étendues d'abord.
export default async function AgentAlertsPage() {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/alertes" });
  const [active, recent] = await Promise.all([
    listAlertsForActor(user.actor, { status: "ACTIVE" }),
    listAlertsForActor(user.actor, { status: "RECENT" }),
  ]);
  const farmsTouched = active.reduce((sum, alert) => sum + alert.farmCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Alertes"
        title="Alertes de mes communes"
        description={
          active.length === 0
            ? "Aucune alerte active pour le moment."
            : `${active.length} alerte${active.length > 1 ? "s" : ""} active${active.length > 1 ? "s" : ""}, ${new Intl.NumberFormat("fr-FR").format(farmsTouched)} exploitations concernées.`
        }
      />
      <AgentAlertTabs
        activeCount={active.length}
        recentCount={recent.length}
        unreadActive={unreadCount(active)}
        active={<AlertList alerts={active} empty="Aucune alerte active dans vos communes" />}
        recent={<AlertList alerts={recent} empty="Aucune alerte ces 30 derniers jours" />}
      />
    </div>
  );
}
