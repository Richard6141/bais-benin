import { RainChart } from "@/components/data-display/rain-chart";
import { SortableTable } from "@/components/data-display/sortable-table";
import { StatTile } from "@/components/data-display/stat-tile";
import { WeatherStrip } from "@/components/data-display/weather-strip";
import { AlertLinkList, formatSourceDate } from "@/features/monitoring/alert-views";
import type { CommuneProfile } from "@/modules/analytics";
import type { CommuneWeather } from "@/modules/monitoring";
import { formatDecimal, formatInteger, formatShare } from "./dashboard-logic";
import { formatShortDate } from "./provenance";

type AlertList = Parameters<typeof AlertLinkList>[0]["alerts"];

// C1 : comparaisons de la commune au département et au pays, en « fois la moyenne ».
export function CommuneComparison({ profile }: { profile: CommuneProfile }) {
  const { comparison, registeredFarmerShare } = profile;
  const phrases = [
    comparison?.farmCountVsDepartement != null
      ? `${formatDecimal(comparison.farmCountVsDepartement)} fois la moyenne départementale d'exploitations`
      : null,
    comparison?.farmCountVsNational != null
      ? `${formatDecimal(comparison.farmCountVsNational)} fois la moyenne nationale`
      : null,
  ].filter((phrase): phrase is string => phrase !== null);
  return (
    <div className="flex flex-col gap-1 text-sm">
      {phrases.length > 0 ? <p>{phrases.join(", ")}.</p> : null}
      <p className="text-muted-foreground">
        {registeredFarmerShare === null
          ? "Population rurale (INStaD) non encore chargée : la part de producteurs enregistrés n'est pas calculée."
          : `${formatShare(registeredFarmerShare)} de la population rurale enregistrée comme producteur.`}
      </p>
    </div>
  );
}

// C3 : couverture terrain. Les agents sont nommés pour le ministère, anonymisés ailleurs (le
// service choisit le libellé).
export function FieldCoverageSection({ profile }: { profile: CommuneProfile }) {
  const coverage = profile.fieldCoverage;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Agents affectés"
          value={coverage.agentCount}
          source="Affectations en cours"
        />
        <StatTile
          label="Visites sur 90 jours"
          value={coverage.visits90d}
          source="Visites de vérification"
        />
        <StatTile
          label="Part vérifiée"
          value={
            profile.figures.masked || profile.figures.verifiedShare === null
              ? "n.d."
              : formatShare(profile.figures.verifiedShare)
          }
          source="Vérifiées par un agent ou sur le terrain"
        />
      </div>
      {coverage.agents.length > 0 ? (
        <SortableTable
          caption="Agents de la commune"
          initialSort={{ key: "visits", direction: "descending" }}
          columns={[
            { key: "agent", label: "Agent" },
            { key: "visits", label: "Visites sur 90 jours", align: "right" },
            { key: "sync", label: "Dernière synchronisation", align: "right" },
          ]}
          rows={coverage.agents.map((agent) => ({
            key: agent.label,
            cells: {
              agent: { display: agent.label, sort: agent.label },
              visits: { display: formatInteger(agent.visits90d), sort: agent.visits90d },
              sync: {
                display: agent.lastSyncAt ? formatShortDate(agent.lastSyncAt) : "jamais",
                sort: agent.lastSyncAt ? agent.lastSyncAt.getTime() : null,
              },
            },
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Aucun agent affecté à cette commune.</p>
      )}
    </div>
  );
}

// C4 : météo et alertes de la commune, lues dans le monitoring de l'étape 6.
export function WeatherAndAlerts({
  weather,
  alerts,
}: {
  weather: CommuneWeather | null;
  alerts: AlertList;
}) {
  const sourceDate = weather?.fetchedAt ? formatSourceDate(weather.fetchedAt) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {weather && weather.strip.length > 0 ? (
        <>
          <WeatherStrip days={weather.strip} source={weather.source} sourceDate={sourceDate} />
          <RainChart
            days={weather.rain}
            thresholdMm={10}
            thresholdLabel="Forte pluie 10 mm"
            source={weather.source}
            sourceDate={sourceDate}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Météo momentanément indisponible.</p>
      )}
      {alerts.length > 0 ? (
        <AlertLinkList
          alerts={alerts}
          variant="compact"
          label="Alertes actives de la commune"
          hrefFor={(alert) => `/pilotage/alertes/${alert.id}`}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Aucune alerte active dans la commune.</p>
      )}
    </div>
  );
}
