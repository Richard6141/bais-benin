import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { ForecastTable } from "@/features/dashboard/forecast-table";
import {
  DEFICIT_THRESHOLD_PCT,
  MIN_HARVESTS_FOR_LEVEL,
  getHarvestForecast,
} from "@/modules/analytics";

export const metadata: Metadata = { title: "Prévisions de récolte" };

// Prévision des récoltes de la campagne en cours (ADR-0020) : par culture pour tout le pays, puis
// par département pour une culture. Ministère seulement dans cette première version.
export default async function ForecastPage(props: PageProps<"/pilotage/previsions">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/previsions" });
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const cropCode = typeof params.culture === "string" ? params.culture : undefined;
  const forecast = await getHarvestForecast(user.actor, { cropCode });
  const total = forecast.rows.reduce((sum, row) => sum + row.productionT, 0);
  const tonnes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={
          forecast.cropCode
            ? `Prévision ${(forecast.cropName ?? forecast.cropCode).toLowerCase()} par département (campagne ${forecast.campaign.code})`
            : `Prévisions de récolte (campagne ${forecast.campaign.code})`
        }
        description={`Surfaces semées de la campagne × rendements observés en ${forecast.historyCampaigns.join(" et ")}. ${forecast.deficits > 0 ? `${forecast.deficits} ${forecast.cropCode ? "département" : "culture"}${forecast.deficits > 1 ? "s" : ""} en déficit probable (baisse de ${Math.abs(DEFICIT_THRESHOLD_PCT)} % ou plus). ` : ""}Production totale prévue : ${tonnes.format(total)} t.`}
        actions={
          forecast.cropCode ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={"/pilotage/previsions" as Route}>Toutes les cultures</Link>
            </Button>
          ) : null
        }
      />
      <ForecastTable
        forecast={forecast}
        hrefFor={forecast.cropCode ? undefined : (code) => `/pilotage/previsions?culture=${code}`}
      />
      <section className="flex flex-col gap-2 rounded-sm border bg-muted/40 p-4 text-sm">
        <h2 className="font-bold">Méthode</h2>
        <p>
          Pour chaque culture et chaque commune : surface semée déclarée pour la campagne ×
          rendement de référence. Le rendement de référence est celui des campagnes{" "}
          {forecast.historyCampaigns.join(" et ")}, pris dans la commune si elle compte au moins{" "}
          {MIN_HARVESTS_FOR_LEVEL} récoltes déclarées, sinon dans le département, sinon dans le
          pays, sinon le rendement type de la culture. La fourchette va du premier au troisième
          quart des rendements observés par parcelle. La confiance dit la part de la surface dont le
          rendement vient de sa propre commune.
        </p>
        <p>
          La campagne précédente est estimée de la même façon, avec ses propres rendements : la
          variation compare deux estimations faites à méthode égale. La colonne satellite donne la
          part des parcelles contrôlées dont la végétation ne correspond pas à la culture déclarée ;
          elle signale un risque, elle ne modifie pas le chiffre.
        </p>
        <p className="text-muted-foreground">
          Les besoins de consommation (population × consommation par habitant) ne sont pas encore
          intégrés : il faudra les données de l&apos;INStaD pour passer de la production prévue au
          bilan alimentaire.
        </p>
      </section>
    </div>
  );
}
