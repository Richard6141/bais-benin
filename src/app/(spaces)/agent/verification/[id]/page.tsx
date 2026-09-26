import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { formatHa } from "@/features/registry/agent/labels";
import { VisitForm, type VisitParcel } from "@/features/registry/verification/visit-form";
import { getFarmDetail, listCampaigns, listCrops } from "@/modules/registry";
import { getParcelCropPrediction } from "@/modules/satellite";

export const metadata: Metadata = { title: "Visite de vérification" };

const idSchema = z.string().uuid();

export default async function VisitPage(props: PageProps<"/agent/verification/[id]">) {
  const user = await requireRole("AGENT_AGRICULTURE");
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const farm = await getFarmDetail(user.actor, id);
  if (!farm) notFound();
  const [crops, campaigns] = await Promise.all([listCrops(), listCampaigns()]);
  const open = campaigns.find((campaign) => campaign.status === "OPEN")?.code;
  // Culture principale déclarée pour la campagne ouverte (la plus grande surface), et l'avis du
  // satellite sur la parcelle, pour guider ce que l'agent regarde sur place.
  const parcels: VisitParcel[] = await Promise.all(
    farm.parcels.map(async (parcel) => {
      const main = parcel.crops
        .filter((crop) => crop.campaignCode === open)
        .sort((a, b) => b.areaHa - a.areaHa)[0];
      const measured = await getParcelCropPrediction(user.actor, parcel.id);
      return {
        id: parcel.id,
        code: parcel.code,
        areaHa: parcel.computedAreaHa ?? parcel.declaredAreaHa,
        declaredCropCode: main?.cropCode ?? null,
        declaredCropName: main?.cropName ?? null,
        measured:
          measured && measured.agreement !== "AGREES"
            ? { label: measured.cropLabel, confidence: measured.confidence }
            : null,
      };
    }),
  );
  const points = [
    `Superficie déclarée ${formatHa(farm.declaredAreaHa)}${farm.computedAreaHa === null ? ", aucun relevé" : ""}`,
    farm.parcelCount === 0
      ? "Aucune parcelle décrite"
      : `${farm.parcelCount} parcelle(s) déclarée(s)`,
    farm.cropCodes.length === 0
      ? "Aucune culture déclarée"
      : `Cultures : ${farm.cropCodes.join(", ")}`,
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visite de vérification"
        title={farm.farmer.displayName}
        description={`${farm.code} (${farm.commune.name}${farm.village ? `, ${farm.village}` : ""})`}
      />
      <ul className="flex flex-wrap gap-2 text-sm">
        {points.map((point) => (
          <li key={point} className="rounded-md bg-muted px-3 py-1.5">
            {point}
          </li>
        ))}
      </ul>
      <VisitForm
        userId={user.id}
        farm={{
          id: farm.id,
          code: farm.code,
          farmerName: farm.farmer.displayName,
          declaredAreaHa: farm.declaredAreaHa,
          communeName: farm.commune.name,
        }}
        parcels={parcels}
        crops={crops.map((crop) => ({ code: crop.code, name: crop.nameFr }))}
      />
    </div>
  );
}
