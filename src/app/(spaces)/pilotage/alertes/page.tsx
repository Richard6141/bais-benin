import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatTile } from "@/components/data-display/stat-tile";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRole } from "@/features/auth/session";
import { AlertMap } from "@/features/monitoring/alert-map";
import { AlertLinkList } from "@/features/monitoring/alert-views";
import { CenterFilters } from "@/features/monitoring/center-filters";
import {
  filterByDepartement,
  freshnessOf,
  parseCenterFilters,
  percentFormatter,
} from "@/features/monitoring/monitoring-logic";
import {
  communeAlertLevels,
  getMonitoringOverview,
  listAlertsForActor,
} from "@/modules/monitoring";
import { listCommunes, listDepartements } from "@/modules/territory";

export const metadata: Metadata = { title: "Centre d'alertes" };

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// C1 : vue nationale des alertes. Trois chiffres, puis la carte et la liste côte à côte.
// requireRole("ADMIN_STATE") la réserve au ministère, comme le reste du pilotage (compte identifié
// par NPI, ADR-0012).
export default async function AlertCenterPage(props: PageProps<"/pilotage/alertes">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/alertes" });
  const params = await props.searchParams;
  const filters = parseCenterFilters(params);
  const commune = typeof params.commune === "string" ? params.commune : undefined;

  const [overview, levels, alerts, communes, departements] = await Promise.all([
    getMonitoringOverview(user.actor),
    communeAlertLevels(),
    listAlertsForActor(user.actor, {
      status: "ACTIVE",
      severity: filters.severity,
      category: filters.category,
      communeCode: commune,
      limit: 300,
    }),
    listCommunes(),
    listDepartements(),
  ]);
  const departementOf = new Map(communes.map((c) => [c.code, c.departementCode]));
  const communeNames = Object.fromEntries(communes.map((c) => [c.code, c.name]));
  const visible = filterByDepartement(alerts, filters.departementCode, departementOf);
  const freshness = freshnessOf(overview.lastIngestion);
  const bySeverity = overview.activeBySeverity;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Centre d'alertes"
        description="Alertes agro-climatiques actives sur le territoire, calculées chaque matin à partir des données météo des 77 communes."
      />

      {freshness.warning ? (
        <Alert variant="watch">
          <AlertTitle>
            {freshness.state === "FALLBACK"
              ? "Données de démonstration"
              : "Données météo à vérifier"}
          </AlertTitle>
          <AlertDescription>
            <p>{freshness.warning}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Chiffres des alertes" className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Alertes actives"
            value={bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.WATCH + bySeverity.INFO}
            source={`${bySeverity.CRITICAL} graves, ${bySeverity.WARNING} alertes, ${bySeverity.WATCH} vigilances, ${bySeverity.INFO} infos`}
          />
          <StatTile
            label="Communes en alerte"
            value={overview.communesInAlert}
            source="sur 77 communes"
          />
          <StatTile
            label="Exploitations touchées"
            value={overview.affectedFarms}
            source={`${integer.format(overview.affectedAreaHa)} ha concernés`}
            reliability="DECLARED"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Taux de lecture :{" "}
          {overview.readRate === null
            ? "non mesuré"
            : `${percentFormatter.format(overview.readRate)} des destinataires`}
          . Données météo : {freshness.label.toLowerCase()} ({freshness.source}).
        </p>
      </section>

      {/* Carte et liste côte à côte sur grand écran : on lit la carte en parcourant la liste. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <AlertMap levels={levels} communeNames={communeNames} />

        <section
          id="liste"
          aria-labelledby="liste-title"
          className="flex scroll-mt-24 flex-col gap-4 lg:max-h-[36rem]"
        >
          <h2 id="liste-title" className="text-xl font-semibold">
            Alertes actives
            {commune ? ` à ${communeNames[commune] ?? commune}` : ""}
            <span className="tabular ml-2 text-base font-normal text-muted-foreground">
              {visible.length}
            </span>
          </h2>
          <Suspense>
            <CenterFilters departements={departements} />
          </Suspense>
          {visible.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="Aucune alerte pour ces filtres" />
          ) : (
            <div className="min-h-0 overflow-y-auto overscroll-contain lg:pr-1">
              <AlertLinkList
                alerts={visible}
                variant="compact"
                label="Alertes actives"
                hrefFor={(alert) => `/pilotage/alertes/${alert.id}`}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
