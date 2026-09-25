import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RainChart } from "@/components/data-display/rain-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { AlertDetailView } from "@/features/monitoring/alert-detail";
import { formatSourceDate } from "@/features/monitoring/alert-views";
import { getAlertDetail, getCommuneWeather } from "@/modules/monitoring";

export const metadata: Metadata = { title: "Alerte (audit)" };

// C2 : fiche d'audit. Règle et version, trace complète, indicateurs lus, diffusion, et la pluie
// de la commune pour replacer l'alerte dans son contexte.
export default async function MinistryAlertPage(props: PageProps<"/pilotage/alertes/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("ADMIN_STATE", { returnTo: `/pilotage/alertes/${id}` });
  const alert = /^[0-9a-f-]{36}$/i.test(id) ? await getAlertDetail(user.actor, id) : null;
  if (!alert) notFound();
  const weather = await getCommuneWeather(alert.communeCode);

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AlertDetailView alert={alert} audit />
      {weather && weather.rain.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pluie à {weather.communeName}, 30 jours</CardTitle>
          </CardHeader>
          <CardContent>
            <RainChart
              days={weather.rain}
              thresholdMm={10}
              source={weather.source}
              sourceDate={weather.fetchedAt ? formatSourceDate(weather.fetchedAt) : undefined}
            />
          </CardContent>
        </Card>
      ) : null}
      <Button asChild variant="outline" className="h-11 self-start">
        <Link href="/pilotage/alertes">Retour au centre d&apos;alertes</Link>
      </Button>
    </div>
  );
}
