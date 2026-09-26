import type { Route } from "next";
import Link from "next/link";
import { AlertCard, type AlertCardData } from "@/components/data-display/alert-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertListItem } from "@/modules/monitoring";
import { summarizeDelivery } from "./monitoring-logic";

// Vues partagées par les trois espaces : conversion d'une alerte du domaine vers la carte du
// design system, liste de cartes cliquables et résumé de diffusion.

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatSourceDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function toCardData(alert: AlertListItem): AlertCardData {
  return {
    title: alert.title,
    communeName: alert.communeName,
    severity: alert.severity,
    category: alert.category,
    message: alert.message,
    advice: alert.advice,
    startsOn: alert.startsOn,
    endsOn: alert.endsOn,
    farmCount: alert.farmCount,
    hectares: alert.hectares,
    source: alert.source,
    sourceDate: formatSourceDate(alert.sourceDate),
    readAt: alert.readAt,
    awaitingConfirmation: alert.awaitingConfirmation,
  };
}

interface AlertLinkListProps {
  alerts: readonly AlertListItem[];
  hrefFor: (alert: AlertListItem) => string;
  variant: "compact" | "farmer";
  label: string;
}

// Chaque carte est un lien vers la fiche : un seul tap, cible pleine carte (≥ 44 px).
export function AlertLinkList({ alerts, hrefFor, variant, label }: AlertLinkListProps) {
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link
            href={hrefFor(alert) as Route}
            className="block rounded-xl transition-shadow outline-none hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AlertCard alert={toCardData(alert)} variant={variant} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DeliverySummary({
  rows,
}: {
  rows: readonly { channel: string; status: string; count: number }[] | null;
}) {
  const channels = summarizeDelivery(rows ?? []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diffusion</CardTitle>
        <CardDescription>Messages par canal et par état, du plus au moins utilisé.</CardDescription>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun destinataire pour le moment.</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            {channels.map((channel) => (
              <div key={channel.channel} className="rounded-lg border p-3">
                <dt className="flex items-baseline justify-between gap-2 font-medium">
                  {channel.label}
                  <span className="tabular text-sm text-muted-foreground">{channel.total}</span>
                </dt>
                <dd className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {channel.byStatus.map((status) => (
                    <span key={status.status} className="tabular">
                      {status.label} : <strong>{status.count}</strong>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
