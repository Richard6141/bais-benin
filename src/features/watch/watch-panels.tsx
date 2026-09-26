import type { Route } from "next";
import Link from "next/link";
import { HelpTip } from "@/components/forms/help-tip";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { REPORT_TYPE_LABELS } from "@/features/reports/labels";
import type { FieldReportType } from "@/modules/reports";
import type { WatchSummary } from "@/modules/watch";

// Blocs du centre de veille : indicateurs sobres, listes courtes, fraîcheur des sources. Heures
// affichées à Porto-Novo ; aucune donnée nominative d'une demande d'assistance.

const clock = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});
const dayClock = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});
const integer = new Intl.NumberFormat("fr-FR");

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

export function Indicator({
  label,
  value,
  help,
  tone = "default",
}: {
  label: string;
  value: number;
  help: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        <HelpTip label={label}>{help}</HelpTip>
      </div>
      <p
        className={`tabular text-3xl font-semibold ${tone === "alert" && value > 0 ? "text-critical" : ""}`}
      >
        {integer.format(value)}
      </p>
    </div>
  );
}

function Panel({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {title}
        <HelpTip label={title}>{help}</HelpTip>
      </h2>
      {children}
    </section>
  );
}

export function AlertsPanel({ summary }: { summary: WatchSummary }) {
  return (
    <Panel
      title="Alertes actives"
      help="Les alertes en cours, les plus graves d'abord. Un foyer en attente n'est pas encore diffusé aux producteurs."
    >
      {summary.alerts.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune alerte en cours.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {summary.alerts.items.map((alert) => (
            <li key={alert.id} className="flex flex-col gap-1">
              <Link
                href={`/pilotage/alertes/${alert.id}` as Route}
                className="font-medium underline-offset-4 hover:underline"
              >
                {alert.title}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <SeverityBadge severity={alert.severity} />
                {alert.communeName}
                {alert.awaitingConfirmation ? ", en attente de confirmation" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function HeldOutbreaksPanel({ summary }: { summary: WatchSummary }) {
  return (
    <Panel
      title="Foyers à confirmer"
      help="Foyers comptés sur des signalements non vérifiés : ils ne partent aux producteurs qu'après la confirmation d'un signalement par un agent."
    >
      {summary.heldOutbreaks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun foyer en attente.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {summary.heldOutbreaks.map((outbreak) => (
            <li key={outbreak.id}>
              <Link
                href={`/pilotage/alertes/${outbreak.id}` as Route}
                className="font-medium underline-offset-4 hover:underline"
              >
                {outbreak.title}
              </Link>
              <span className="block text-muted-foreground">
                {outbreak.communeName}, depuis le {dayClock.format(new Date(outbreak.startsOn))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ExposurePanel({
  summary,
  window,
}: {
  summary: WatchSummary;
  window: "24h" | "7d";
}) {
  const rows = summary.exposure[window];
  const period = window === "24h" ? "24 heures" : "7 jours";
  return (
    <Panel
      title="Parcelles exposées aux feux"
      help={`Communes où des feux ont été détectés à moins de 1 km de parcelles enregistrées ces ${period}, avec le nombre de producteurs et d'exploitations exposés. Confiance moyenne ou haute seulement.`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun feu à moins de 1 km d&apos;une parcelle ces {period}.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="pb-1 font-normal">Commune</th>
              <th className="pb-1 text-right font-normal">Producteurs</th>
              <th className="pb-1 text-right font-normal">Feux</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.commune_code} className="border-t">
                <td className="py-1.5">{row.commune_name}</td>
                <td className="tabular py-1.5 text-right font-medium">
                  {integer.format(row.producers)}
                </td>
                <td className="tabular py-1.5 text-right">{integer.format(row.fires)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function ReportGroupsPanel({ summary }: { summary: WatchSummary }) {
  return (
    <Panel
      title="Signalements groupés"
      help="Signalements des 7 derniers jours de même type dans une même commune, deux au moins, les plus répandus d'abord. Les signalements écartés par un agent ne comptent pas."
    >
      {summary.reportGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun signalement groupé cette semaine.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {summary.reportGroups.map((group) => (
            <li key={`${group.communeName}-${group.type}`}>
              <span className="font-medium">
                {REPORT_TYPE_LABELS[group.type as FieldReportType]?.label ?? group.type},{" "}
                {group.communeName}
              </span>
              <span className="block text-muted-foreground">
                {group.reports} signalements de {group.producers} producteur
                {group.producers > 1 ? "s" : ""}, {group.confirmed} confirmé
                {group.confirmed > 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export function CropConditionPanel({ summary }: { summary: WatchSummary }) {
  const condition = summary.cropCondition;
  return (
    <Panel
      title="État des cultures"
      help="Les trois cultures dont la part de surface en état faible est la plus haute, vue du satellite, sur la campagne en cours. Une culture observée sur moins de 5 parcelles n'est pas citée."
    >
      {!condition || condition.worst.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pas encore assez de parcelles contrôlées pour cette campagne.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {condition.worst.map((crop) => (
            <li key={crop.code} className="flex justify-between gap-3">
              <span>{crop.name}</span>
              <span className="tabular text-right">
                <span className="font-medium">{percent.format(crop.poorShare)} faible</span>
                <span className="block text-muted-foreground">
                  sur {integer.format(Math.round(crop.observedHa))} ha observés
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {condition ? (
          <span className="text-muted-foreground">
            Campagne {condition.campaignCode}
            {condition.demo ? ", données de démonstration" : ""}
          </span>
        ) : null}
        <Link
          href={"/pilotage/etat-des-cultures" as Route}
          className="font-medium underline underline-offset-4"
        >
          Voir l&apos;état des cultures
        </Link>
      </p>
    </Panel>
  );
}

const STATE_LABELS = { ok: "À jour", stale: "En retard", failed: "En échec" } as const;

export function FreshnessPanel({ summary }: { summary: WatchSummary }) {
  return (
    <Panel
      title="Fraîcheur des sources"
      help="Dernière mise à jour réussie de chaque source. Feux : toutes les 30 minutes ; météo : chaque jour ; agrégats : toutes les 10 minutes."
    >
      <ul className="flex flex-col gap-2 text-sm">
        {summary.freshness.map((source) => (
          <li key={source.source} className="flex justify-between gap-3">
            <span>{source.source}</span>
            <span
              className={
                source.state === "ok" ? "text-muted-foreground" : "font-medium text-critical"
              }
            >
              {STATE_LABELS[source.state]}
              {source.lastAt ? `, ${dayClock.format(new Date(source.lastAt))}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
