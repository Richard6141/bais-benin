import { BellRing, ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import type { AlertListItem } from "@/modules/monitoring";
import { unreadCount } from "./monitoring-logic";

// Encart « Alertes » de l'accueil agriculteur : l'alerte la plus grave et le nombre non lu,
// un seul lien vers la liste. Rien d'alarmant quand il n'y a rien.
export function AlertsTeaser({ alerts }: { alerts: readonly AlertListItem[] }) {
  const unread = unreadCount(alerts);
  const top = alerts[0];
  return (
    <Link
      href="/agriculteur/alertes"
      aria-label={
        alerts.length === 0
          ? "Alertes : aucune alerte en cours"
          : `Alertes : ${alerts.length} en cours, ${unread} non lue${unread > 1 ? "s" : ""}`
      }
      className="flex min-h-16 items-center gap-4 rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {top ? (
        <BellRing aria-hidden className="size-7 shrink-0 text-warning" />
      ) : (
        <ShieldCheck aria-hidden className="size-7 shrink-0 text-success" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg font-semibold">Alertes</span>
        {top ? (
          <>
            <span className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={top.severity} />
              <span className="truncate text-base">{top.title}</span>
            </span>
            <span className="tabular text-sm text-muted-foreground">
              {alerts.length} en cours
              {unread > 0 ? ` · ${unread} non lue${unread > 1 ? "s" : ""}` : " · toutes lues"}
            </span>
          </>
        ) : (
          <span className="text-base text-muted-foreground">Aucune alerte pour votre commune.</span>
        )}
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
