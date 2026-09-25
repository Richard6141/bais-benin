import { BarList } from "@/components/data-display/bar-list";
import { MaskedValue } from "@/components/data-display/masked-value";
import { SortableTable, type SortableCell } from "@/components/data-display/sortable-table";
import { StatTile } from "@/components/data-display/stat-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DataQuality } from "@/modules/analytics";
import { formatInteger, formatShare } from "./dashboard-logic";
import { formatDataDate } from "./provenance";

const masked = (): SortableCell => ({ display: <MaskedValue />, sort: null });
const count = (value: number | null | undefined): SortableCell =>
  typeof value === "number"
    ? { display: formatInteger(value), sort: value }
    : { display: "—", sort: null };
const share = (value: number | null): SortableCell =>
  value === null ? { display: "—", sort: null } : { display: formatShare(value), sort: value };

/** Lien d'une commune : fiche du pilotage par défaut ; null hors du pilotage (espace agent). */
type CommuneHref = ((code: string) => string) | null;
const pilotageCommune = (code: string) => `/pilotage/communes/${code}`;

// D1 : écarts entre superficie déclarée et superficie relevée, par tranche, puis les communes
// aux écarts médians les plus forts. Seuil de signalement 20 %, comme dans le registre.
export function GapsSection({
  gaps,
  communeHref = pilotageCommune,
}: {
  gaps: DataQuality["gaps"];
  communeHref?: CommuneHref;
}) {
  const b = gaps.buckets;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        {formatInteger(gaps.measuredParcels)} parcelles relevées au GPS ; écart médian{" "}
        {gaps.medianGap === null ? "non calculé" : formatShare(gaps.medianGap)} ;{" "}
        {gaps.flaggedShare === null ? "—" : formatShare(gaps.flaggedShare)} signalées (écart de 20 %
        ou plus).
      </p>
      <BarList
        label="Parcelles par tranche d'écart"
        items={[
          {
            key: "u10",
            label: "Moins de 10 %",
            value: b.under10,
            display: formatInteger(b.under10),
          },
          {
            key: "10-20",
            label: "10 à 20 %",
            value: b.from10to20,
            display: formatInteger(b.from10to20),
          },
          {
            key: "20-50",
            label: "20 à 50 %",
            value: b.from20to50,
            display: formatInteger(b.from20to50),
          },
          { key: "o50", label: "Plus de 50 %", value: b.over50, display: formatInteger(b.over50) },
        ]}
      />
      {gaps.worstCommunes.length > 0 ? (
        <SortableTable
          caption="Communes aux écarts médians les plus forts"
          initialSort={{ key: "median", direction: "descending" }}
          columns={[
            { key: "name", label: "Commune" },
            { key: "parcels", label: "Parcelles relevées", align: "right" },
            { key: "median", label: "Écart médian", align: "right" },
            { key: "flagged", label: "Part signalée", align: "right" },
          ]}
          rows={gaps.worstCommunes.map((c) => ({
            key: c.code,
            href: communeHref?.(c.code),
            cells: {
              name: { display: c.name, sort: c.name },
              parcels: count(c.measuredParcels),
              median: c.masked ? masked() : share(c.medianGap),
              flagged: c.masked ? masked() : share(c.flaggedShare),
            },
          }))}
        />
      ) : null}
    </div>
  );
}

// D2 : exploitations déclarées en attente de vérification, par ancienneté. Les communes les plus
// en retard seulement (le service les trie par déclarations de plus de 180 jours).
const AGEING_ROWS = 20;

export function AgeingSection({
  ageing,
  communeHref = pilotageCommune,
}: {
  ageing: DataQuality["ageing"];
  communeHref?: CommuneHref;
}) {
  const t = ageing.totals;
  return (
    <div className="flex flex-col gap-6">
      <BarList
        label="Exploitations déclarées par ancienneté"
        items={[
          {
            key: "u30",
            label: "Moins de 30 jours",
            value: t.under30Days,
            display: formatInteger(t.under30Days),
          },
          {
            key: "30-180",
            label: "30 à 180 jours",
            value: t.from30to180Days,
            display: formatInteger(t.from30to180Days),
          },
          {
            key: "o180",
            label: "Plus de 180 jours",
            value: t.over180Days,
            display: formatInteger(t.over180Days),
          },
        ]}
      />
      {ageing.communes.length > AGEING_ROWS ? (
        <p className="text-sm text-muted-foreground">
          Les {AGEING_ROWS} communes les plus en retard sur {ageing.communes.length}.
        </p>
      ) : null}
      {ageing.communes.length > 0 ? (
        <SortableTable
          caption="Exploitations déclarées par commune et ancienneté"
          initialSort={{ key: "over180", direction: "descending" }}
          columns={[
            { key: "name", label: "Commune" },
            { key: "declared", label: "Déclarées", align: "right" },
            { key: "under30", label: "Moins de 30 j", align: "right" },
            { key: "mid", label: "30 à 180 j", align: "right" },
            { key: "over180", label: "Plus de 180 j", align: "right" },
          ]}
          rows={ageing.communes.slice(0, AGEING_ROWS).map((c) => ({
            key: c.code,
            href: communeHref?.(c.code),
            cells: {
              name: { display: c.name, sort: c.name },
              declared: c.masked ? masked() : count(c.declaredFarms),
              under30: c.masked ? masked() : count(c.under30Days),
              mid: c.masked ? masked() : count(c.from30to180Days),
              over180: c.masked ? masked() : count(c.over180Days),
            },
          }))}
        />
      ) : null}
    </div>
  );
}

// D3 et D4 : couverture des agents et doublons probables (comptes seulement, jamais de noms).
export function CoverageSection({
  coverage,
  duplicates,
}: {
  coverage: NonNullable<DataQuality["coverage"]>;
  duplicates: DataQuality["duplicates"];
}) {
  const v = coverage.visits30d;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Agents actifs"
          value={coverage.activeAgents}
          source="Affectations en cours"
        />
        <StatTile
          label="Sans synchronisation depuis 14 jours"
          value={coverage.agentsWithoutSync14d}
          source="Agents, compte seulement"
        />
        <StatTile
          label="Communes sans agent actif"
          value={coverage.communesWithoutAgent.length}
          source="sur 77 communes"
        />
        <StatTile
          label="Doublons probables"
          value={duplicates?.probablePairs ?? "—"}
          source="Même nom, même commune, naissance proche"
        />
      </div>
      <BarList
        label="Agents par nombre de visites sur 30 jours"
        items={[
          { key: "0", label: "Aucune visite", value: v.none, display: formatInteger(v.none) },
          {
            key: "1-5",
            label: "1 à 5 visites",
            value: v.from1to5,
            display: formatInteger(v.from1to5),
          },
          {
            key: "6-20",
            label: "6 à 20 visites",
            value: v.from6to20,
            display: formatInteger(v.from6to20),
          },
          {
            key: "20+",
            label: "Plus de 20 visites",
            value: v.over20,
            display: formatInteger(v.over20),
          },
        ]}
      />
      {coverage.communesWithoutAgent.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Communes sans agent actif</h3>
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Communes sans agent actif">
            {coverage.communesWithoutAgent.map((c) => (
              <li key={c.code} className="rounded-sm border px-3 py-1">
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// D5 : fraîcheur des données, avec bandeau si les agrégats ou la météo sont anciens.
export function FreshnessSection({ freshness }: { freshness: DataQuality["freshness"] }) {
  const stale = freshness.aggregatesStale || freshness.weatherStale;
  return (
    <div className="flex flex-col gap-4">
      {stale ? (
        <Alert variant="watch">
          <AlertTitle>Données à rafraîchir</AlertTitle>
          <AlertDescription>
            <p>
              {freshness.aggregatesStale
                ? "Les agrégats datent de plus de 30 minutes : les derniers enregistrements n'y figurent peut-être pas. "
                : ""}
              {freshness.weatherStale
                ? "La météo n'a pas été ingérée depuis plus de 48 heures : les alertes sont suspendues."
                : ""}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Dernière synchronisation"
          value={formatDataDate(freshness.lastSyncAt)}
          wordValue
          source="Terminaux des agents"
        />
        <StatTile
          label="Dernière ingestion météo"
          value={formatDataDate(freshness.lastIngestionAt)}
          wordValue
          source="Open-Meteo"
        />
        <StatTile
          label="Agrégats rafraîchis"
          value={formatDataDate(freshness.aggregatesRefreshedAt)}
          wordValue
          source="Vues d'agrégats du registre"
        />
      </div>
    </div>
  );
}
