import { BellRing, Flame, LifeBuoy, Sprout, Users } from "lucide-react";
import type { Route } from "next";
import type { MomentAction } from "@/components/layout/action-list";
import { countLabel, situationSentence } from "@/lib/text/situation";
import type { WatchSummary } from "@/modules/watch";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/** Part de surface en état faible au-delà de laquelle une culture mérite un regard. */
const POOR_SHARE_WATCH = 0.2;

export interface MinistryMoment {
  sentence: string;
  actions: MomentAction[];
}

/**
 * Situation du jour et actions du moment pour l'accueil du ministère, tirées de la synthèse de
 * veille : alertes graves, foyers à confirmer, feux près des parcelles, demandes en attente,
 * culture en difficulté. Pure, pour être testée sans base.
 */
export function ministryMoment(summary: WatchSummary): MinistryMoment {
  const severe = summary.alerts.bySeverity.CRITICAL + summary.alerts.bySeverity.WARNING;
  const held = summary.heldOutbreaks.length;
  const fires = summary.fires.last24h;
  const exposed = summary.exposure["24h"].reduce((sum, row) => sum + row.producers, 0);
  const waiting = summary.assistance.waiting;
  const worst = summary.cropCondition?.worst[0];

  const sentence = situationSentence(
    null,
    [
      { count: severe, one: "alerte grave", many: "alertes graves" },
      { count: fires, one: "feu en 24 heures", many: "feux en 24 heures" },
      { count: held, one: "foyer à confirmer", many: "foyers à confirmer" },
      { count: waiting, one: "demande en attente", many: "demandes en attente" },
    ],
    "Aucune alerte grave ni feu depuis hier.",
  );

  const actions: MomentAction[] = [];
  if (severe > 0) {
    actions.push({
      href: "/pilotage/alertes" as Route,
      icon: BellRing,
      title: `Examiner ${countLabel(severe, "alerte grave", "alertes graves")}`,
      detail: `Dont ${countLabel(summary.alerts.bySeverity.CRITICAL, "critique", "critiques")}, sur ${countLabel(summary.alerts.active, "alerte active", "alertes actives")}.`,
      urgent: true,
    });
  }
  if (fires > 0) {
    actions.push({
      href: "/pilotage/veille" as Route,
      icon: Flame,
      title: `Suivre ${countLabel(fires, "feu", "feux")} des dernières 24 heures`,
      detail:
        exposed > 0
          ? `${countLabel(exposed, "producteur", "producteurs")} à moins de 1 km d'un feu.`
          : `Dans ${countLabel(summary.fires.communes, "commune", "communes")}, loin des parcelles enregistrées.`,
      urgent: exposed > 0,
    });
  }
  if (held > 0) {
    actions.push({
      href: "/pilotage/veille" as Route,
      icon: Users,
      title: `Faire confirmer ${countLabel(held, "foyer", "foyers")}`,
      detail: "Signalements groupés qui attendent la visite d'un agent avant diffusion.",
    });
  }
  if (waiting > 0) {
    actions.push({
      href: "/pilotage/demandes" as Route,
      icon: LifeBuoy,
      title: `Suivre ${countLabel(waiting, "demande en attente", "demandes en attente")}`,
      detail: "Demandes d'aide des producteurs pas encore prises en charge par un agent.",
    });
  }
  if (worst && worst.poorShare >= POOR_SHARE_WATCH) {
    actions.push({
      href: "/pilotage/etat-des-cultures" as Route,
      icon: Sprout,
      title: "Examiner l'état des cultures",
      detail: `${worst.name} : ${percent.format(worst.poorShare)} de la surface observée en état faible.`,
    });
  }
  return { sentence, actions: actions.slice(0, 5) };
}
