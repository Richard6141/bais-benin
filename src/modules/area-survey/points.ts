import { prisma } from "@/database/client";
import { surveyPoints } from "@/database/sql/area-survey.sql";
import { actorTerritory, type Actor } from "@/modules/authorization";

// Points d'enquête que l'agent peut visiter (ADR-0033) : ceux des communes de son territoire,
// pour la campagne ouverte, avec leur dernier constat. Aucun producteur n'y figure.

export interface SurveyPointView {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  communeName: string;
  /** Dernier constat : occupation du sol et culture, ou null si le point n'a pas été visité. */
  observation: { landCover: string; cropCode: string | null; observedAt: Date } | null;
}

export async function listSurveyPoints(actor: Actor): Promise<SurveyPointView[]> {
  const territory = actorTerritory(actor);
  if (territory.kind === "none" || territory.kind === "self" || territory.kind === "registered") {
    return [];
  }
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true },
  });
  if (!campaign) return [];
  const rows = await surveyPoints(
    campaign.id,
    territory.kind === "all"
      ? null
      : { communeIds: territory.communeIds, departementIds: territory.departementIds },
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    latitude: row.latitude,
    longitude: row.longitude,
    communeName: row.commune_name,
    observation:
      row.land_cover && row.observed_at
        ? { landCover: row.land_cover, cropCode: row.crop_code, observedAt: row.observed_at }
        : null,
  }));
}
