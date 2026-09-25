"use client";

import { CheckCheck } from "lucide-react";
import {
  CATEGORY_LABELS,
  formatPeriod,
  type AlertCategory,
} from "@/components/data-display/alert-labels";
import { SourceCaption } from "@/components/data-display/source-caption";
import { SeverityBadge, type AlertSeverity } from "@/components/data-display/severity-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export { CATEGORY_LABELS, formatPeriod, type AlertCategory };

export interface AlertCardData {
  title: string;
  communeName: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  /** Conseil pratique, mis en valeur sous « Que faire ? ». */
  advice?: string;
  /** Dates ISO (AAAA-MM-JJ ou horodatage). */
  startsOn: string;
  endsOn?: string | null;
  farmCount?: number | null;
  hectares?: number | null;
  source: string;
  sourceDate?: string;
  /** Date ISO de lecture ; null si pas encore lue. */
  readAt?: string | null;
}

interface AlertCardProps {
  alert: AlertCardData;
  /** compact : ligne de liste ; full : fiche détaillée ; farmer : espace agriculteur (18 px, 56 px). */
  variant?: "compact" | "full" | "farmer";
  onMarkRead?: () => void;
  className?: string;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Carte d'alerte : ce qui se passe, où, depuis quand, et surtout que faire. La provenance est
// toujours visible (docs/modules/design-system.md §4.1).
export function AlertCard({ alert, variant = "full", onMarkRead, className }: AlertCardProps) {
  const category = CATEGORY_LABELS[alert.category];
  const compact = variant === "compact";
  const farmer = variant === "farmer";
  const scope = [
    alert.farmCount != null
      ? `${integer.format(alert.farmCount)} exploitation${alert.farmCount > 1 ? "s" : ""}`
      : null,
    alert.hectares != null ? `${integer.format(alert.hectares)} ha` : null,
  ].filter(Boolean);

  return (
    <article
      data-severity={alert.severity}
      data-variant={variant}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-l-4 bg-card text-card-foreground",
        alert.severity === "CRITICAL" && "border-l-critical",
        alert.severity === "WARNING" && "border-l-warning",
        alert.severity === "WATCH" && "border-l-watch",
        alert.severity === "INFO" && "border-l-info",
        compact ? "p-3" : "p-5",
        farmer && "text-lg",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={alert.severity} size={farmer ? "large" : "default"} />
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <category.Icon aria-hidden className="size-4" />
          {category.label}
        </span>
        <span className="text-sm text-muted-foreground">· {alert.communeName}</span>
      </div>

      <h3
        className={cn(
          "font-semibold tracking-tight",
          farmer ? "text-2xl" : compact ? "text-base" : "text-lg",
        )}
      >
        {alert.title}
      </h3>

      {!compact ? <p className={farmer ? "text-lg" : "text-sm"}>{alert.message}</p> : null}

      {alert.advice && !compact ? (
        <div className="rounded-lg bg-accent p-3 text-accent-foreground">
          <p className={cn("font-semibold", farmer ? "text-lg" : "text-sm")}>Que faire ?</p>
          <p className={farmer ? "text-lg" : "text-sm"}>{alert.advice}</p>
        </div>
      ) : null}

      <p className="tabular text-sm text-muted-foreground">
        {formatPeriod(alert.startsOn, alert.endsOn)}
        {scope.length > 0 ? ` · ${scope.join(", ")} concernés` : ""}
      </p>

      {!compact ? <SourceCaption source={alert.source} date={alert.sourceDate} /> : null}

      {alert.readAt ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCheck aria-hidden className="size-4" />
          Lu le {dateFormatter.format(new Date(alert.readAt))}
        </p>
      ) : onMarkRead ? (
        <Button
          type="button"
          variant={farmer ? "default" : "outline"}
          onClick={onMarkRead}
          className={cn(farmer ? "h-14 w-full text-base" : "self-start")}
        >
          J&apos;ai lu
        </Button>
      ) : null}
    </article>
  );
}
