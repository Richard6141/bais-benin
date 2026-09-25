import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WeatherStrip } from "@/components/data-display/weather-strip";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { AlertLinkList, formatSourceDate } from "@/features/monitoring/alert-views";
import { getCommuneWeather, listAlertsForActor } from "@/modules/monitoring";
import { listOwnFarms } from "@/modules/registry";

export const metadata: Metadata = { title: "Mes alertes" };

// A1 « Mes alertes » : la météo de la commune en tête, puis les alertes actives, la plus grave
// d'abord. Une colonne, gros texte, une carte = un tap.
export default async function FarmerAlertsPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/alertes" });
  const farms = await listOwnFarms(user.id);
  const communeCode = farms[0]?.commune.code ?? null;
  const [alerts, weather] = await Promise.all([
    listAlertsForActor(user.actor, { status: "ACTIVE" }),
    communeCode ? getCommuneWeather(communeCode) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Mes alertes"
        title={weather ? `Météo et alertes à ${weather.communeName}` : "Mes alertes"}
        description="Les alertes vous disent ce qui se passe et ce que vous pouvez faire."
      />

      {weather ? (
        <section aria-label="Météo de la commune" className="flex min-w-0 flex-col gap-3">
          <WeatherStrip
            days={weather.strip}
            source={weather.source}
            sourceDate={weather.fetchedAt ? formatSourceDate(weather.fetchedAt) : undefined}
          />
          <Button asChild variant="outline" className="h-14 w-full text-base">
            <Link href="/agriculteur/meteo">Voir la météo détaillée</Link>
          </Button>
        </section>
      ) : null}

      {alerts.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Aucune alerte en cours pour votre commune"
          description="Tout va bien pour le moment. Si un risque apparaît (sécheresse, forte pluie, chaleur, ravageurs), vous serez prévenu ici et par message."
        />
      ) : (
        <AlertLinkList
          alerts={alerts}
          variant="farmer"
          label="Alertes en cours"
          hrefFor={(alert) => `/agriculteur/alertes/${alert.id}`}
        />
      )}
    </div>
  );
}
