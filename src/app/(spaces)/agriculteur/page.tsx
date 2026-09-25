import { CalendarDays, LandPlot } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { ReliabilityBadge, type Reliability } from "@/components/data-display/reliability-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile } from "@/components/data-display/stat-tile";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { formatHarvestOf } from "@/features/registry/harvest/format";
import { AlertsTeaser } from "@/features/monitoring/alerts-teaser";
import { listAlertsForActor } from "@/modules/monitoring";
import { getFarmDetail, listCampaigns, listOwnFarms, type FarmDetail } from "@/modules/registry";

export const metadata: Metadata = { title: "Mon exploitation" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const kgFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Statut de vérification de l'exploitation → niveau de fiabilité affiché (docs/08 §1.1).
const reliabilityOf: Record<FarmDetail["verificationStatus"], Reliability> = {
  DECLARED: "DECLARED",
  AGENT_VERIFIED: "AGENT_VERIFIED",
  FIELD_VERIFIED: "FIELD_VERIFIED",
  DISPUTED: "DECLARED",
};

function lastHarvest(farm: FarmDetail) {
  const declarations = farm.parcels.flatMap((p) =>
    p.crops.flatMap((c) =>
      c.declarations.map((d) => ({ ...d, cropName: c.cropName, cropCode: c.cropCode })),
    ),
  );
  return declarations.sort((a, b) => b.declaredOn.getTime() - a.declaredOn.getTime())[0] ?? null;
}

// E1 « Mon exploitation » : une colonne, gros chiffres, pictogrammes, un bouton principal.
export default async function FarmerSpacePage() {
  const user = await requireRole("FARMER");
  const farms = await listOwnFarms(user.id);
  const first = farms[0];
  if (!first) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Espace agriculteur" title={`Bonjour, ${user.name}`} />
        <EmptyState
          icon={<LandPlot />}
          title="Votre exploitation n'est pas encore enregistrée"
          description="Votre agent vous enregistrera lors de sa prochaine visite. Vous verrez ensuite ici vos parcelles, vos cultures et vos récoltes."
        />
      </div>
    );
  }

  const [farm, campaigns, alerts] = await Promise.all([
    getFarmDetail(user.actor, first.id),
    listCampaigns(),
    listAlertsForActor(user.actor, { status: "ACTIVE" }),
  ]);
  if (!farm) return null;
  const openCampaign = campaigns.find((c) => c.status === "OPEN")?.code ?? null;
  const cropsThisCampaign = [
    ...new Map(
      farm.parcels
        .flatMap((p) => p.crops)
        .filter((c) => c.campaignCode === openCampaign)
        .map((c) => [c.cropCode, c.cropName] as const),
    ).entries(),
  ];
  const harvest = lastHarvest(farm);
  const reliability = reliabilityOf[farm.verificationStatus];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        eyebrow="Mon exploitation"
        title={farm.name ?? farm.farmer.displayName}
        description={`${farm.commune.name}${farm.village ? `, ${farm.village}` : ""} · code ${farm.code}`}
      />
      {farms.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          Vous avez {farms.length} exploitations enregistrées ; celle-ci est la première.
        </p>
      ) : null}

      <AlertsTeaser alerts={alerts} />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Superficie déclarée"
          value={farm.declaredAreaHa}
          unit="ha"
          reliability={reliability}
          source="Registre BAIS"
          sourceDate={dateFormatter.format(farm.provenance.sourceDate)}
        />
        <StatTile
          label="Superficie mesurée"
          value={farm.computedAreaHa ?? "—"}
          unit={farm.computedAreaHa === null ? undefined : "ha"}
          reliability={farm.computedAreaHa === null ? "DECLARED" : "FIELD_VERIFIED"}
          source={farm.computedAreaHa === null ? "Aucun contour relevé" : "Relevé GPS de l'agent"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Mes cultures cette campagne</CardTitle>
          <CardDescription>
            {openCampaign ? `Campagne ${openCampaign}` : "Aucune campagne ouverte"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cropsThisCampaign.length === 0 ? (
            <p className="text-base text-muted-foreground">
              Aucune culture déclarée pour l&apos;instant. Votre agent peut les ajouter.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {cropsThisCampaign.map(([code, name]) => (
                <li key={code} className="flex flex-col items-center gap-1 text-primary">
                  <CropGlyph code={code as CropCode} size={48} />
                  <span className="text-sm font-medium text-foreground">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Dernière récolte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {harvest ? (
            <>
              <p className="tabular text-3xl font-semibold">
                {formatHarvestOf(harvest.declaredQuantity, harvest.unit, harvest.cropName)}
              </p>
              <p className="flex items-center gap-2 text-base text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                {dateFormatter.format(harvest.declaredOn)} · ≈{" "}
                {kgFormatter.format(harvest.quantityKg)} kg
              </p>
            </>
          ) : (
            <p className="text-base text-muted-foreground">
              Aucune récolte déclarée pour le moment.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Button asChild className="h-14 w-full text-base">
          <Link href="/agriculteur/recolte">Déclarer ma récolte</Link>
        </Button>
        <Button asChild variant="outline" className="h-14 w-full text-base">
          <Link href="/agriculteur/historique">Mon historique</Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ReliabilityBadge level={reliability} />
        <SourceCaption
          source={farm.provenance.sourceId}
          date={dateFormatter.format(farm.provenance.sourceDate)}
        />
      </div>
    </div>
  );
}
