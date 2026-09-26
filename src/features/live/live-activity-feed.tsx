"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Flame,
  HandHelping,
  type LucideIcon,
  MapPinned,
  Megaphone,
  Sprout,
  Tractor,
  Wheat,
} from "lucide-react";
import { HelpTip } from "@/components/forms/help-tip";
import { SEVERITY_LABELS } from "@/components/data-display/severity-badge";
import { ASSISTANCE_CATEGORY_LABELS } from "@/features/assistance/labels";
import { REPORT_TYPE_LABELS } from "@/features/reports/labels";
import { cn } from "@/lib/utils";
import type { LiveActivityItem } from "@/modules/live";
import { useLiveActivity, type LiveStatus } from "./use-live-activity";

// Fil d'activité en direct : ce qui arrive du terrain et du ciel, au fil de l'eau (enregistrements,
// contours relevés, récoltes, visites, signalements, alertes, feux, demandes). Un fait ouvre sa
// fiche quand le lecteur y a droit. Aucun nom de personne : un type, une commune, une heure.

const clock = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});
const day = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Porto-Novo",
});

interface KindView {
  label: string;
  Icon: LucideIcon;
  tone: "neutral" | "alert" | "field";
}

const FARM_KINDS: Record<string, KindView> = {
  "farm.CREATED": { label: "Exploitation enregistrée", Icon: Tractor, tone: "field" },
  "farm.PARCEL_ADDED": { label: "Parcelle ajoutée", Icon: Sprout, tone: "field" },
  "farm.PARCEL_GEOMETRY_SET": { label: "Contour de champ relevé", Icon: MapPinned, tone: "field" },
  "farm.CROP_DECLARED": { label: "Culture déclarée", Icon: Sprout, tone: "field" },
  "farm.HARVEST_DECLARED": { label: "Récolte déclarée", Icon: Wheat, tone: "field" },
  "farm.VERIFIED": { label: "Visite de vérification", Icon: ClipboardCheck, tone: "field" },
};

export function describeActivity(item: LiveActivityItem): KindView {
  const farm = FARM_KINDS[item.kind];
  if (farm) return farm;
  switch (item.kind) {
    case "report.created": {
      const type = REPORT_TYPE_LABELS[item.detail as keyof typeof REPORT_TYPE_LABELS];
      return {
        label: `Signalement${type ? ` : ${type.label.toLowerCase()}` : ""}`,
        Icon: Megaphone,
        tone: "neutral",
      };
    }
    case "alert.raised": {
      const severity = SEVERITY_LABELS[item.detail as keyof typeof SEVERITY_LABELS];
      return {
        label: `Alerte levée${severity ? ` (${severity.toLowerCase()})` : ""}`,
        Icon: AlertTriangle,
        tone: "alert",
      };
    }
    case "fire.detected":
      return { label: "Feu détecté", Icon: Flame, tone: "alert" };
    case "assistance.requested": {
      const category =
        ASSISTANCE_CATEGORY_LABELS[item.detail as keyof typeof ASSISTANCE_CATEGORY_LABELS];
      return {
        label: `Demande d'aide${category ? ` : ${category.label.toLowerCase()}` : ""}`,
        Icon: HandHelping,
        tone: "neutral",
      };
    }
    default:
      return { label: "Activité", Icon: Sprout, tone: "neutral" };
  }
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const today = day.format(new Date());
  const label = day.format(date);
  return label === today ? clock.format(date) : `${label}, ${clock.format(date)}`;
}

const STATUS: Record<LiveStatus, { label: string; dot: string }> = {
  connecting: { label: "Connexion", dot: "bg-muted-foreground" },
  live: { label: "En direct", dot: "bg-forest animate-pulse" },
  reconnecting: { label: "Reconnexion", dot: "bg-watch" },
};

export function LiveActivityFeed({
  className,
  onItems,
  maxItems = 12,
}: {
  className?: string;
  /** Faits nouveaux (hors rattrapage), pour les montrer sur une carte par exemple. */
  onItems?: (items: LiveActivityItem[]) => void;
  maxItems?: number;
}) {
  const { status, items, fresh } = useLiveActivity(onItems);
  const shown = items.slice(0, maxItems);
  const state = STATUS[status];

  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          Activité
          <HelpTip label="Activité en direct">
            Ce qui arrive du terrain et des satellites, au fil de l&apos;eau : exploitations et
            contours enregistrés, récoltes, visites, signalements, alertes, feux et demandes
            d&apos;aide. Un relevé fait hors ligne apparaît à la synchronisation du téléphone de
            l&apos;agent.
          </HelpTip>
        </h2>
        <span
          className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
          aria-live="polite"
        >
          <span aria-hidden className={cn("inline-block size-2 rounded-full", state.dot)} />
          {state.label}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Rien de nouveau depuis une heure. Les faits apparaîtront ici dès leur arrivée.
        </p>
      ) : (
        <ol className="flex flex-col divide-y" aria-label="Derniers faits">
          {shown.map((item) => {
            const view = describeActivity(item);
            const content = (
              <>
                <view.Icon
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    view.tone === "alert"
                      ? "text-laterite"
                      : view.tone === "field"
                        ? "text-forest"
                        : "text-muted-foreground",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm leading-snug font-medium">{view.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.communeName} ({item.departementName})
                  </span>
                </span>
                <time dateTime={item.at} className="tabular shrink-0 text-xs text-muted-foreground">
                  {timeLabel(item.at)}
                </time>
              </>
            );
            const rowClass = cn(
              "flex items-start gap-2.5 py-2 transition-colors",
              fresh.has(item.id) && "bg-forest-soft/60",
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href as Route}
                    className={cn(
                      rowClass,
                      "-mx-2 rounded-sm px-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
