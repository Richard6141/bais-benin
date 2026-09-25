import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { RainChart } from "@/components/data-display/rain-chart";
import { StatTile } from "@/components/data-display/stat-tile";
import { WeatherStrip } from "@/components/data-display/weather-strip";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRole } from "@/features/auth/session";
import { formatSourceDate } from "@/features/monitoring/alert-views";
import { freshnessOf } from "@/features/monitoring/monitoring-logic";
import { getCommuneWeather } from "@/modules/monitoring";
import { listOwnFarms } from "@/modules/registry";

export const metadata: Metadata = { title: "Météo de ma commune" };

// A3 : sept jours à venir, pluie des trente derniers jours et cumul sur dix jours, avec la
// source et la fraîcheur des données toujours visibles.
export default async function FarmerWeatherPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/meteo" });
  const farms = await listOwnFarms(user.id);
  const communeCode = farms[0]?.commune.code;
  const weather = communeCode ? await getCommuneWeather(communeCode) : null;

  if (!weather || weather.strip.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Météo" title="Météo de ma commune" />
        <EmptyState
          icon={<CloudOff />}
          title="Prévisions momentanément indisponibles"
          description="Les données de votre commune apparaîtront dès la prochaine mise à jour."
        />
      </div>
    );
  }

  const freshness = freshnessOf(
    weather.fetchedAt
      ? {
          finishedAt: weather.fetchedAt,
          provider: weather.source,
          fallback: weather.reliability === "SYNTHETIC",
          status: "SUCCEEDED",
        }
      : null,
  );
  const sourceDate = weather.fetchedAt ? formatSourceDate(weather.fetchedAt) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Météo"
        title={`Météo à ${weather.communeName}`}
        description="Trois jours passés et sept jours de prévisions, puis la pluie du mois."
      />
      {freshness.state === "STALE" || freshness.state === "FALLBACK" ? (
        <Alert variant="watch">
          <AlertTitle>
            {freshness.state === "FALLBACK" ? "Données de démonstration" : "Données anciennes"}
          </AlertTitle>
          <AlertDescription>
            <p>
              {freshness.state === "FALLBACK"
                ? "Le service météo n'a pas répondu : ces chiffres servent à la démonstration."
                : `Dernières données du ${sourceDate}.`}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <WeatherStrip days={weather.strip} source={weather.source} sourceDate={sourceDate} />
      <StatTile
        label="Pluie des 10 derniers jours"
        value={weather.rain10dMm ?? "—"}
        unit={weather.rain10dMm === null ? undefined : "mm"}
        source={weather.source}
        sourceDate={sourceDate}
        reliability={weather.reliability === "SYNTHETIC" ? "SYNTHETIC" : "ESTIMATED"}
      />
      <section aria-labelledby="rain-title" className="flex min-w-0 flex-col gap-2">
        <h2 id="rain-title" className="text-xl font-semibold">
          Pluie jour par jour
        </h2>
        <RainChart
          days={weather.rain}
          thresholdMm={10}
          thresholdLabel="Forte pluie 10 mm"
          source={weather.source}
          sourceDate={sourceDate}
        />
      </section>
    </div>
  );
}
