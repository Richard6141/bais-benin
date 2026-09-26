import { BellRing, Bug, ClipboardCheck, LifeBuoy, PlusCircle } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { KeyFigures } from "@/components/data-display/key-figures";
import { ActionList, type MomentAction } from "@/components/layout/action-list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { LiveActivityFeed } from "@/features/live/live-activity-feed";
import { FarmList } from "@/features/registry/agent/farm-list";
import { LocalFarms } from "@/features/registry/agent/local-farms";
import { OfflineReadiness } from "@/features/registry/agent/offline-readiness";
import { countLabel, situationSentence } from "@/lib/text/situation";
import { listAssistanceForActor } from "@/modules/assistance";
import { listAgentRequests } from "@/modules/assistant";
import { listAlertsForActor } from "@/modules/monitoring";
import { countFarmsForActor, listFarmsForActor, scopedCommunes } from "@/modules/registry";
import { listReportsForActor } from "@/modules/reports";

export const metadata: Metadata = { title: "Espace agent" };

const integer = new Intl.NumberFormat("fr-FR");

// Accueil de l'agent en tableau de bord d'action : la situation du jour en une phrase, les choses
// à faire maintenant (vérifier, répondre, relayer, constater), puis le reste (chiffres, dernières
// mises à jour, fil d'activité). Chaque action ouvre l'écran où la faire.
export default async function AgentHomePage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  const [counts, recent, scope, alerts, received, questions, reports] = await Promise.all([
    countFarmsForActor(user.actor),
    listFarmsForActor(user.actor, { limit: 5 }),
    scopedCommunes(user.actor),
    listAlertsForActor(user.actor, { status: "ACTIVE" }),
    listAssistanceForActor(user.actor, { status: "RECEIVED" }),
    listAgentRequests(user.actor).catch(() => []),
    listReportsForActor(user.actor, { status: "SUBMITTED" }),
  ]);
  const place =
    scope === "all" ? null : scope === "none" ? null : scope.map((c) => c.name).join(", ");
  const requests = received.length + questions.filter((q) => q.status === "OPEN").length;
  const severe = alerts.filter((a) => a.severity === "CRITICAL" || a.severity === "WARNING");

  const sentence = situationSentence(
    place,
    [
      { count: alerts.length, one: "alerte en cours", many: "alertes en cours" },
      { count: counts.declared, one: "exploitation à vérifier", many: "exploitations à vérifier" },
      { count: requests, one: "demande à traiter", many: "demandes à traiter" },
      { count: reports.length, one: "signalement à constater", many: "signalements à constater" },
    ],
    place ? `Rien d'urgent à ${place} aujourd'hui.` : "Rien d'urgent aujourd'hui.",
  );

  const actions: MomentAction[] = [];
  if (alerts.length > 0) {
    actions.push({
      href: "/agent/alertes" as Route,
      icon: BellRing,
      title: `Relayer ${countLabel(alerts.length, "alerte", "alertes")}`,
      detail:
        severe.length > 0
          ? `Dont ${countLabel(severe.length, "grave", "graves")} : prévenez les producteurs sans téléphone.`
          : "À relayer de vive voix aux producteurs sans téléphone.",
      urgent: severe.length > 0,
    });
  }
  if (reports.length > 0) {
    actions.push({
      href: "/agent/signalements?statut=SUBMITTED" as Route,
      icon: Bug,
      title: `Constater ${countLabel(reports.length, "signalement", "signalements")}`,
      detail: "Un signalement confirmé sur place déclenche l'alerte de foyer pour les voisins.",
    });
  }
  if (requests > 0) {
    actions.push({
      href: "/agent/demandes" as Route,
      icon: LifeBuoy,
      title: `Répondre à ${countLabel(requests, "demande", "demandes")}`,
      detail: "Demandes d'aide et questions des producteurs de votre commune.",
    });
  }
  if (counts.declared > 0) {
    actions.push({
      href: "/agent/verification" as Route,
      icon: ClipboardCheck,
      title: `Vérifier ${countLabel(counts.declared, "exploitation", "exploitations")}`,
      detail: "Déclarées sans visite, les plus anciennes d'abord.",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Espace agent de terrain"
        title={`Bonjour, ${user.name}`}
        description={sentence}
        actions={
          <Button asChild className="h-11 px-5">
            <Link href="/agent/enregistrer">
              <PlusCircle aria-hidden />
              Enregistrer une exploitation
            </Link>
          </Button>
        }
      />

      <OfflineReadiness userId={user.id} />

      <ActionList
        actions={actions.slice(0, 5)}
        idle="Rien n'attend : c'est le moment d'enregistrer de nouvelles exploitations."
      />

      <KeyFigures
        label="Chiffres de votre périmètre"
        figures={[
          { label: "Exploitations", value: integer.format(counts.total) },
          { label: "À vérifier", value: integer.format(counts.declared) },
          { label: "Vérifiées sur le terrain", value: integer.format(counts.verified) },
        ]}
        source="registre national, exploitations de votre périmètre"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <LocalFarms userId={user.id} />
          <section aria-labelledby="recent-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="text-lg font-semibold">
                Dernières mises à jour
              </h2>
              <Button asChild variant="link" size="sm">
                <Link href="/agent/exploitations">Toutes les exploitations</Link>
              </Button>
            </div>
            <FarmList
              items={recent.items}
              emptyTitle="Aucune exploitation dans votre périmètre"
              emptyDescription="L'enregistrement se fait en sept étapes, possible sans réseau."
            />
          </section>
        </div>
        <LiveActivityFeed maxItems={8} />
      </div>
    </div>
  );
}
