import type { Metadata } from "next";
import Link from "next/link";
import { CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { SourceCaption } from "@/components/data-display/source-caption";
import { StatTile, type StatTrend } from "@/components/data-display/stat-tile";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { CampaignSelect } from "@/features/registry/harvest/campaign-select";
import {
  cropStageLabel,
  formatHarvestQuantity,
  subSeasonLabel,
} from "@/features/registry/harvest/format";
import { listHarvestHistory, listOwnFarms, type CampaignHistory } from "@/modules/registry";

export const metadata: Metadata = { title: "Mon historique" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Exploitation enregistrée",
  PARCEL_ADDED: "Parcelle ajoutée",
  PARCEL_GEOMETRY_SET: "Contour de parcelle relevé",
  CROP_DECLARED: "Culture déclarée",
  HARVEST_DECLARED: "Récolte déclarée",
  VERIFIED: "Visite de vérification",
  ALERT_RELAYED: "Alerte transmise par votre agent",
};

/** Tendance de la récolte totale par rapport à la campagne précédente, si les deux existent. */
function harvestTrend(
  current: CampaignHistory,
  previous: CampaignHistory | undefined,
): StatTrend | undefined {
  if (!previous || previous.totalKg === 0 || current.totalKg === 0) return undefined;
  const value = ((current.totalKg - previous.totalKg) / previous.totalKg) * 100;
  return { value: Math.round(value * 10) / 10, label: `par rapport à ${previous.campaignCode}` };
}

// E3 « Historique par campagne » : un sélecteur, des cartes, un chiffre de comparaison.
export default async function HarvestHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ campagne?: string }>;
}) {
  const user = await requireRole("FARMER");
  const farms = await listOwnFarms(user.id);
  const farm = farms[0];
  const history = farm ? await listHarvestHistory(user.actor, farm.id) : null;
  if (!farm || !history) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Mon historique" title="Rien à afficher pour le moment" />
        <EmptyState
          title="Votre exploitation n'est pas encore enregistrée"
          description="Votre agent vous enregistrera lors de sa prochaine visite."
        />
      </div>
    );
  }

  const { campagne } = await searchParams;
  const campaigns = history.campaigns;
  const selected =
    campaigns.find((c) => c.campaignCode === campagne) ??
    campaigns.find((c) => c.status === "OPEN") ??
    campaigns[0];
  const previous = selected
    ? campaigns[campaigns.findIndex((c) => c.campaignCode === selected.campaignCode) + 1]
    : undefined;
  const events = history.events.slice(-12).reverse();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        eyebrow="Mon historique"
        title={farm.name ?? farm.farmer.displayName}
        description={`${farm.commune.name} (code ${farm.code})`}
      />

      {campaigns.length === 0 || !selected ? (
        <EmptyState
          title="Aucune campagne enregistrée"
          description="Les cultures et récoltes apparaîtront ici dès leur déclaration."
        />
      ) : (
        <>
          <CampaignSelect
            campaigns={campaigns.map((c) => ({ code: c.campaignCode, status: c.status }))}
            value={selected.campaignCode}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Récolte déclarée"
              value={selected.totalKg}
              unit="kg"
              trend={harvestTrend(selected, previous)}
              reliability="DECLARED"
              source="Vos déclarations"
            />
            <StatTile
              label="Surface cultivée"
              value={selected.totalAreaHa}
              unit="ha"
              reliability="DECLARED"
              source="Registre BAIS"
            />
          </div>

          <section className="flex flex-col gap-3" aria-labelledby="cultures-campagne">
            <h2 id="cultures-campagne" className="text-xl font-semibold">
              Cultures de la campagne {selected.campaignCode}
            </h2>
            {selected.crops.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Aucune culture déclarée pour cette campagne.
              </p>
            ) : (
              selected.crops.map((crop) => (
                <Card key={crop.parcelCropId}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <CropGlyph
                        code={crop.cropCode as CropCode}
                        size={48}
                        className="text-primary"
                      />
                      <div>
                        <CardTitle className="text-lg">{crop.cropName}</CardTitle>
                        <CardDescription>
                          Parcelle {crop.parcelCode.split("-").pop()},{" "}
                          {numberFormatter.format(crop.areaHa)} ha, {subSeasonLabel(crop.subSeason)}
                          , {cropStageLabel(crop.stage)}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {crop.declarations.length === 0 ? (
                      <p className="text-base text-muted-foreground">
                        Pas encore de récolte déclarée.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-base">
                        {crop.declarations.map((d) => (
                          <li key={d.id} className="flex justify-between gap-3">
                            <span>{formatHarvestQuantity(d.declaredQuantity, d.unit)}</span>
                            <span className="tabular text-muted-foreground">
                              ≈ {numberFormatter.format(d.quantityKg)} kg, le{" "}
                              {dateFormatter.format(d.declaredOn)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="fil-activite">
        <h2 id="fil-activite" className="text-xl font-semibold">
          Derniers événements
        </h2>
        {events.length === 0 ? (
          <p className="text-base text-muted-foreground">Aucun événement enregistré.</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-xl border bg-card">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-base"
              >
                <span>{EVENT_LABELS[event.kind] ?? event.kind}</span>
                <span className="tabular shrink-0 text-sm text-muted-foreground">
                  {dateFormatter.format(event.occurredAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <SourceCaption source="Registre BAIS, fil d'activité de l'exploitation" />
      </section>

      <Button asChild variant="outline" className="h-14 w-full text-base">
        <Link href="/agriculteur">Retour à mon exploitation</Link>
      </Button>
    </div>
  );
}
