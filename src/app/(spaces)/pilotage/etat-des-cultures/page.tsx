import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import {
  ConditionLegend,
  CropConditionCards,
  CropConditionTable,
} from "@/features/dashboard/crop-condition-view";
import { getCropCondition } from "@/modules/analytics";

export const metadata: Metadata = { title: "État des cultures" };

// État des cultures de la campagne, vu du satellite : par culture pour tout le pays, puis par
// département pour la culture choisie. Ministère seulement.
export default async function CropConditionPage(props: PageProps<"/pilotage/etat-des-cultures">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/etat-des-cultures" });
  const params = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const condition = await getCropCondition(user.actor);
  const requested = typeof params.culture === "string" ? params.culture : null;
  const selected =
    condition.crops.find((crop) => crop.code === requested) ?? condition.crops[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={`État des cultures (campagne ${condition.campaign.code})`}
        description="Vigueur de la végétation mesurée par satellite sur chaque parcelle contrôlée, en part de la surface semée."
      />
      {condition.demo ? (
        <p className="rounded-sm border border-watch/40 bg-watch/10 px-4 py-3 text-sm">
          Verdicts de démonstration, calculés sur des séries NDVI synthétiques. La tâche mensuelle
          les remplace par des mesures Copernicus dès qu&apos;elle tourne avec le compte du
          ministère.
        </p>
      ) : null}
      {selected ? (
        <>
          <ConditionLegend />
          <CropConditionCards
            crops={condition.crops}
            selected={selected.code}
            hrefFor={(code) => `/pilotage/etat-des-cultures?culture=${code}`}
          />
          <section aria-labelledby="etat-departements" className="flex flex-col gap-3">
            <h2 id="etat-departements" className="text-lg font-semibold">
              {selected.name} par département
            </h2>
            <CropConditionTable crop={selected} />
          </section>
        </>
      ) : (
        <p className="rounded-sm border bg-muted/40 p-4 text-sm">
          Aucune parcelle contrôlée par satellite pour cette campagne.
        </p>
      )}
      <section className="flex flex-col gap-2 rounded-sm border bg-muted/40 p-4 text-sm">
        <h2 className="font-bold">Méthode</h2>
        <p>
          Chaque parcelle déclarée avec un contour est suivie par Sentinel-2 tous les dix jours.
          Quand sa saison est passée, son indice de végétation (NDVI) le plus haut est comparé à la
          médiane des parcelles de la même culture dans la même zone agro-écologique. Quatre
          centièmes au-dessus ou plus : l&apos;état est bon. Quatre centièmes en dessous ou plus :
          il est faible. Entre les deux : moyen. Les parcelles dont la végétation ne correspond pas
          à la culture déclarée sont comptées à part, à vérifier sur le terrain.
        </p>
        <p className="text-muted-foreground">
          Une mesure, pas une estimation d&apos;observateurs : les parts sont celles de la surface
          semée jugée. Une saison encore en cours ou cachée par les nuages n&apos;est pas jugée.
        </p>
      </section>
    </div>
  );
}
