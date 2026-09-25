import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatTile } from "@/components/data-display/stat-tile";
import { Button } from "@/components/ui/button";
import type { DataQuality } from "@/modules/analytics";
import type { MonitoringOverview } from "@/modules/monitoring";
import { formatInteger, formatShare } from "./dashboard-logic";
import { formatShortDate } from "./provenance";

/** Section titrée du tableau de bord, avec une action en tête et une ancre. */
export function DashboardSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="flex scroll-mt-24 flex-col gap-4"
      data-print-block
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={`${id}-titre`} className="text-xl font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 print:hidden">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

// A6 : résumé des alertes en cours, lu dans le monitoring de l'étape 6.
export function AlertsSummary({ overview }: { overview: MonitoringOverview }) {
  const s = overview.activeBySeverity;
  const active = s.CRITICAL + s.WARNING + s.WATCH + s.INFO;
  if (active === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucune alerte en cours sur le territoire.</p>
    );
  }
  const date = overview.lastIngestion?.finishedAt
    ? formatShortDate(new Date(overview.lastIngestion.finishedAt))
    : undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Alertes actives"
        value={active}
        source={`${s.CRITICAL} graves · ${s.WARNING} alertes · ${s.WATCH} vigilances`}
        sourceDate={date}
      />
      <StatTile
        label="Communes en alerte"
        value={overview.communesInAlert}
        source="sur 77 communes"
      />
      <StatTile
        label="Exploitations touchées"
        value={overview.affectedFarms}
        source={`${formatInteger(overview.affectedAreaHa)} ha concernés`}
        reliability="DECLARED"
      />
      <StatTile
        label="Taux de lecture"
        value={overview.readRate === null ? "—" : formatShare(overview.readRate)}
        source="Destinataires ayant lu l'alerte"
      />
    </div>
  );
}

// A7 : la qualité en un coup d'œil. Les seuils colorent la source, pas la valeur : un chiffre
// élevé n'est pas une faute du lecteur, c'est un travail à planifier.
export function QualityGlance({ quality }: { quality: DataQuality }) {
  const gap = quality.gaps.medianGap;
  const old = quality.ageing.totals.over180Days;
  const withoutAgent = quality.coverage?.communesWithoutAgent.length ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Écart médian déclaré / mesuré"
          value={gap === null ? "—" : formatShare(gap)}
          source={`${formatInteger(quality.gaps.measuredParcels)} parcelles relevées · signalement à 20 %`}
          reliability={gap !== null && gap >= 0.2 ? "DECLARED" : "FIELD_VERIFIED"}
        />
        <StatTile
          label="Non vérifiées depuis 180 jours"
          value={old}
          source="Exploitations déclarées, en attente de visite"
        />
        <StatTile
          label="Communes sans agent actif"
          value={withoutAgent ?? "—"}
          source="sur 77 communes"
        />
      </div>
      <Button asChild variant="outline" className="h-11 self-start print:hidden">
        <Link href={"/pilotage/qualite" as Route}>Voir la qualité des données</Link>
      </Button>
    </div>
  );
}
