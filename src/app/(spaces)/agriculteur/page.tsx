import { CalendarDays, LandPlot, LifeBuoy, MessageSquareWarning, Wheat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { KeyFigures } from "@/components/data-display/key-figures";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { DamageList } from "@/features/damage/damage-list";
import { FirstStepsCard } from "@/features/onboarding/first-steps-card";
import { formatHarvestOf } from "@/features/registry/harvest/format";
import { AlertsTeaser } from "@/features/monitoring/alerts-teaser";
import { FireAlertCard } from "@/features/monitoring/fire-alert-card";
import { PendingReports } from "@/features/reports/pending-reports";
import { situationSentence } from "@/lib/text/situation";
import { listAssistanceForActor } from "@/modules/assistance";
import { listAlertsForActor } from "@/modules/monitoring";
import { listDamageDeclarations } from "@/modules/fires";
import { getFarmFireAlert } from "@/modules/fires/farm-alert";
import { getFarmDetail, listCampaigns, listOwnFarms, type FarmDetail } from "@/modules/registry";

export const metadata: Metadata = { title: "Mon exploitation" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const kgFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const haFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function lastHarvest(farm: FarmDetail) {
  const declarations = farm.parcels.flatMap((p) =>
    p.crops.flatMap((c) =>
      c.declarations.map((d) => ({ ...d, cropName: c.cropName, cropCode: c.cropCode })),
    ),
  );
  return declarations.sort((a, b) => b.declaredOn.getTime() - a.declaredOn.getTime())[0] ?? null;
}

const ACTIONS = [
  { href: "/agriculteur/recolte", label: "Déclarer ma récolte", icon: Wheat },
  { href: "/agriculteur/signaler", label: "Signaler un problème", icon: MessageSquareWarning },
  { href: "/agriculteur/solliciter", label: "Demander de l'aide", icon: LifeBuoy },
] as const;

// Accueil du producteur, pensé pour un téléphone : la situation du jour en une phrase, l'alerte
// qui le concerne, trois gestes, puis ses chiffres et sa campagne en bref. Les autres rubriques
// sont dans la barre du bas.
export default async function FarmerSpacePage() {
  const user = await requireRole("FARMER");
  const farms = await listOwnFarms(user.id);
  const first = farms[0];
  if (!first) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Espace agriculteur" title={`Bonjour, ${user.name}`} />
        <EmptyState
          icon={<LandPlot />}
          title="Votre exploitation n'est pas encore enregistrée"
          description="Votre agent vous enregistrera lors de sa prochaine visite. Vous verrez ensuite ici vos parcelles, vos cultures et vos récoltes."
          action={
            <Button asChild variant="outline" className="h-11">
              <Link href="/agriculteur/solliciter">Demander la visite d&apos;un agent</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [farm, campaigns, alerts, requests, fireAlert, damages] = await Promise.all([
    getFarmDetail(user.actor, first.id),
    listCampaigns(),
    listAlertsForActor(user.actor, { status: "ACTIVE" }),
    listAssistanceForActor(user.actor, { limit: 20 }),
    getFarmFireAlert(user.actor, first.id),
    listDamageDeclarations(user.actor, { limit: 5 }),
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
  const openRequests = requests.filter((request) => request.status !== "RESOLVED").length;
  const sentence = situationSentence(
    null,
    [
      {
        count: alerts.length,
        one: "alerte en cours pour votre commune",
        many: "alertes en cours pour votre commune",
      },
      { count: openRequests, one: "demande en cours", many: "demandes en cours" },
    ],
    `Aucune alerte pour ${farm.commune.name} aujourd'hui.`,
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        eyebrow="Mon exploitation"
        title={farm.name ?? farm.farmer.displayName}
        description={sentence}
      />

      {fireAlert ? <FireAlertCard alert={fireAlert} /> : null}
      {/* Sinistres après un feu (ADR-0038 §2) : estimation satellite, puis constat de l'agent. */}
      {damages.length > 0 ? (
        <section aria-labelledby="mes-sinistres" className="flex flex-col gap-2">
          <h2 id="mes-sinistres" className="text-lg font-semibold">
            Mes sinistres
          </h2>
          <DamageList rows={damages} showFarmer={false} />
        </section>
      ) : null}
      {alerts.length > 0 ? <AlertsTeaser alerts={alerts} /> : null}
      <PendingReports userId={user.id} />

      <nav aria-label="Actions" className="grid gap-2 sm:grid-cols-3">
        {ACTIONS.map((action, index) => (
          <Button
            key={action.href}
            asChild
            variant={index === 0 ? "default" : "outline"}
            className="h-14 w-full justify-start text-base sm:h-20 sm:flex-col sm:justify-center sm:text-sm"
          >
            <Link href={action.href}>
              <action.icon aria-hidden className="size-5" />
              {action.label}
            </Link>
          </Button>
        ))}
      </nav>

      <FirstStepsCard role="producteur" userId={user.id} />

      <KeyFigures
        label="Mon exploitation en chiffres"
        figures={[
          {
            label: "Superficie déclarée",
            value: haFormatter.format(farm.declaredAreaHa),
            unit: "ha",
          },
          farm.computedAreaHa === null
            ? { label: "Superficie mesurée", value: "Non mesurée" }
            : {
                label: "Superficie mesurée",
                value: haFormatter.format(farm.computedAreaHa),
                unit: "ha",
              },
        ]}
        source={`${farm.commune.name}${farm.village ? `, ${farm.village}` : ""}, code ${farm.code}`}
        sourceDate={dateFormatter.format(farm.provenance.sourceDate)}
      />

      <section
        aria-labelledby="campagne-titre"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h2 id="campagne-titre" className="text-base font-semibold">
          {openCampaign ? `Campagne ${openCampaign}` : "Aucune campagne ouverte"}
        </h2>
        {cropsThisCampaign.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune culture déclarée pour l&apos;instant. Votre agent les enregistre lors de sa
            visite.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Mes cultures cette campagne">
            {cropsThisCampaign.map(([code, name]) => (
              <li key={code} className="flex items-center gap-1.5 text-primary">
                <CropGlyph code={code as CropCode} size={24} />
                <span className="text-sm font-medium text-foreground">{name}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-center gap-2 border-t pt-3 text-sm">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {harvest ? (
            <span>
              Dernière récolte :{" "}
              <span className="font-semibold">
                {formatHarvestOf(harvest.declaredQuantity, harvest.unit, harvest.cropName)}
              </span>{" "}
              le {dateFormatter.format(harvest.declaredOn)} (environ{" "}
              {kgFormatter.format(harvest.quantityKg)} kg)
            </span>
          ) : (
            <span className="text-muted-foreground">Aucune récolte déclarée pour le moment.</span>
          )}
        </p>
      </section>

      {farms.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          Vous avez {farms.length} exploitations enregistrées ; l&apos;accueil montre la première.{" "}
          <Link
            href="/agriculteur/champs"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Voir tous mes champs
          </Link>
        </p>
      ) : null}
    </div>
  );
}
