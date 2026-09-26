import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { SurveyPointForm } from "@/features/area-survey/survey-point-form";
import { requireRole } from "@/features/auth/session";
import { listSurveyPoints } from "@/modules/area-survey";
import { listCrops } from "@/modules/registry";

export const metadata: Metadata = { title: "Constat d'un point" };

const idSchema = z.string().uuid();

// Constat d'un point d'enquête (ADR-0033), dans les seules communes de l'agent.
export default async function SurveyPointPage(props: PageProps<"/agent/sondage/[id]">) {
  const user = await requireRole("AGENT_AGRICULTURE");
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const [points, crops] = await Promise.all([listSurveyPoints(user.actor), listCrops()]);
  const point = points.find((entry) => entry.id === id);
  if (!point) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Point d'enquête"
        title={point.code}
        description={
          point.observation
            ? "Déjà constaté : un nouveau constat remplacera le précédent."
            : "Rendez-vous au point et notez ce que vous y voyez."
        }
      />
      <SurveyPointForm
        userId={user.id}
        point={{
          id: point.id,
          code: point.code,
          latitude: point.latitude,
          longitude: point.longitude,
          communeName: point.communeName,
        }}
        crops={crops.map((crop) => ({ code: crop.code, name: crop.nameFr }))}
      />
    </div>
  );
}
