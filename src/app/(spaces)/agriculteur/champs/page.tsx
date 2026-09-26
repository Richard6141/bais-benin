import { LandPlot, MapPinned } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { HelpTip } from "@/components/forms/help-tip";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { getFarmDetail, listCampaigns, listOwnFarms, type FarmDetail } from "@/modules/registry";

export const metadata: Metadata = { title: "Mes champs" };

const hectares = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

type Parcel = FarmDetail["parcels"][number];

// « Mes champs » : chaque parcelle du producteur, sa surface déclarée et mesurée, ce qui y pousse
// cette campagne, et un lien qui l'ouvre sur la carte. Rien d'autre : la fiche complète reste celle
// de l'agent, le producteur vient ici vérifier que ses champs sont bien connus.
export default async function FarmerFieldsPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/champs" });
  const [owned, campaigns] = await Promise.all([listOwnFarms(user.id), listCampaigns()]);
  const farms = (await Promise.all(owned.map((farm) => getFarmDetail(user.actor, farm.id)))).filter(
    (farm): farm is FarmDetail => farm !== null,
  );
  const openCampaign = campaigns.find((campaign) => campaign.status === "OPEN")?.code ?? null;
  const parcelCount = farms.reduce((sum, farm) => sum + farm.parcels.length, 0);
  const declaredHa = farms.reduce(
    (sum, farm) => sum + farm.parcels.reduce((total, parcel) => total + parcel.declaredAreaHa, 0),
    0,
  );

  if (parcelCount === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader eyebrow="Mes champs" title="Mes champs" />
        <EmptyState
          icon={<LandPlot />}
          title="Aucun champ enregistré pour le moment"
          description="Votre agent enregistre vos champs lors de sa visite. Ils apparaîtront ici, avec leur surface et leurs cultures."
          action={
            <Button asChild variant="outline" className="h-11">
              <Link href="/agriculteur">Retour à l&apos;accueil</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Mes champs"
        title="Mes champs"
        description={`${parcelCount} parcelle${parcelCount > 1 ? "s" : ""}, ${hectares.format(declaredHa)} ha déclarés${openCampaign ? `, campagne ${openCampaign}` : ""}.`}
      />
      {farms.map((farm) => (
        <section
          key={farm.id}
          aria-labelledby={`exploitation-${farm.id}`}
          className="flex flex-col gap-3"
        >
          {farms.length > 1 ? (
            <h2 id={`exploitation-${farm.id}`} className="text-lg">
              {farm.name ?? `Exploitation ${farm.code}`}
            </h2>
          ) : (
            <h2 id={`exploitation-${farm.id}`} className="sr-only">
              {farm.name ?? `Exploitation ${farm.code}`}
            </h2>
          )}
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {farm.parcels.map((parcel) => (
              <ParcelRow key={parcel.id} parcel={parcel} openCampaign={openCampaign} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ParcelRow({ parcel, openCampaign }: { parcel: Parcel; openCampaign: string | null }) {
  const crops = [
    ...new Map(
      parcel.crops
        .filter((crop) => crop.campaignCode === openCampaign)
        .map((crop) => [crop.cropCode, crop.cropName] as const),
    ).entries(),
  ];
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-semibold text-heading">Parcelle {parcel.code}</p>
        <p className="tabular text-sm">
          {hectares.format(parcel.declaredAreaHa)} ha déclarés
          {parcel.computedAreaHa !== null
            ? `, ${hectares.format(parcel.computedAreaHa)} ha mesurés`
            : null}
        </p>
        {parcel.computedAreaHa === null ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            Contour pas encore relevé
            <HelpTip label="Contour de la parcelle">
              Votre agent fait le tour du champ au GPS lors d&apos;une visite. La surface mesurée
              s&apos;affiche ensuite ici.
            </HelpTip>
          </p>
        ) : null}
        {crops.length > 0 ? (
          <ul className="flex flex-wrap gap-3 pt-1" aria-label="Cultures de la campagne">
            {crops.map(([code, name]) => (
              <li key={code} className="flex items-center gap-1.5 text-sm text-primary">
                <CropGlyph code={code as CropCode} size={24} />
                <span className="text-foreground">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune culture déclarée cette campagne.</p>
        )}
      </div>
      <Button asChild variant="outline" className="h-11 shrink-0">
        <Link href={`/carte?parcelle=${parcel.id}` as Route}>
          <MapPinned aria-hidden />
          Voir sur la carte
        </Link>
      </Button>
    </li>
  );
}
