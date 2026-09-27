import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { DamageList } from "@/features/damage/damage-list";
import { DamageReviewForm } from "@/features/damage/damage-review-form";
import { getDamageDeclaration } from "@/modules/fires";
import { listCrops } from "@/modules/registry";

export const metadata: Metadata = { title: "Constat de sinistre" };

const idSchema = z.uuid();

// Constat d'un sinistre sur place (ADR-0038 §2) : l'estimation satellite, puis la décision de
// l'agent. Une déclaration déjà traitée se lit seulement.
export default async function DamageReviewPage(props: PageProps<"/agent/sinistres/[id]">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/sinistres" });
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const [row, crops] = await Promise.all([getDamageDeclaration(user.actor, id), listCrops()]);
  if (!row) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Sinistres"
        title={`${row.farm.farmer.firstName} ${row.farm.farmer.lastName}`}
        description={`Exploitation ${row.farm.code}, parcelle ${row.parcel.code}, à ${row.burnAssessment.fireDistanceM} m du feu détecté.`}
      />
      <DamageList rows={[row]} />
      {row.status === "PROPOSED" ? (
        <DamageReviewForm
          userId={user.id}
          declarationId={row.id}
          estimate={{ lowHa: Number(row.estimatedLowHa), highHa: Number(row.estimatedHighHa) }}
          crops={crops.map((crop) => ({ code: crop.code, nameFr: crop.nameFr }))}
        />
      ) : null}
    </div>
  );
}
