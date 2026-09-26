import type { Route } from "next";
import Link from "next/link";
import { HelpTip } from "@/components/data-display/help-tip";
import { SeverityBadge } from "@/components/data-display/severity-badge";
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

export function FiresPanel({ summary }: { summary: WatchSummary }) {
  return (
    <Panel
      title="Derniers feux"
      help="Feux détectés par satellite au Bénin ces dernières 24 heures, heure de Porto-Novo. Source NASA FIRMS."
    >
      {summary.fires.latest.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun feu détecté ces dernières 24 heures.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {summary.fires.latest.map((fire, index) => (
            <li key={`${fire.detectedAt}-${index}`} className="flex justify-between gap-3">
              <span>{fire.communeName}</span>
              <span className="tabular text-muted-foreground">
                {dayClock.format(new Date(fire.detectedAt))}
                {fire.frpMw !== null ? `, ${fire.frpMw.toLocaleString("fr-FR")} MW` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
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
