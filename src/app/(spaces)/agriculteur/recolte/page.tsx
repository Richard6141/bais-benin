import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { HarvestWizard } from "@/features/registry/harvest/harvest-wizard";
import type { WizardSeason } from "@/features/registry/harvest/wizard-logic";
import { getFarmDetail, listDeclarableCropSeasons, listOwnFarms } from "@/modules/registry";

export const metadata: Metadata = { title: "Déclarer ma récolte" };

// Parcours C : la page serveur charge les cultures déclarables de la campagne ouverte et
// délègue les trois écrans au composant client.
export default async function HarvestDeclarationPage() {
  const user = await requireRole("FARMER");
  const farms = await listOwnFarms(user.id);
  const farm = farms[0];
  if (!farm) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Déclarer ma récolte" title="Pas encore d'exploitation" />
        <EmptyState
          title="Votre exploitation n'est pas encore enregistrée"
          description="Votre agent vous enregistrera lors de sa prochaine visite."
          action={
            <Button asChild variant="outline" className="h-14 text-base">
              <Link href="/agriculteur">Retour</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [seasons, detail] = await Promise.all([
    listDeclarableCropSeasons(user.actor, farm.id),
    getFarmDetail(user.actor, farm.id),
  ]);
  const wizardSeasons: WizardSeason[] = seasons.map((s) => ({
    parcelCropId: s.parcelCropId,
    parcelCode: s.parcelCode,
    cropCode: s.cropCode,
    cropName: s.cropName,
    campaignCode: s.campaignCode,
    tradeUnit: s.tradeUnit,
    expectedHarvestOn: s.expectedHarvestOn?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        eyebrow="Déclarer ma récolte"
        title={farm.name ?? farm.farmer.displayName}
        description={farm.commune.name}
      />
      <HarvestWizard seasons={wizardSeasons} parcelCount={detail?.parcels.length ?? 1} />
    </div>
  );
}
