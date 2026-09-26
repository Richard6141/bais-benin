import { z } from "zod";
import { prisma } from "@/database/client";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { getSurveyEstimates, type TargetEstimate } from "@/modules/area-survey";
import { cropGroupOf } from "@/modules/satellite/crop-groups";

// Rapprochement des surfaces officielles avec les nôtres (ADR-0034) : pour chaque culture et
// chaque territoire où la DSA ou FAOSTAT donne une surface, sa dernière campagne connue face à la
// surface déclarée au registre (couverture du registre) et, dans les communes d'enquête, face à
// la surface estimée par sondage et sa marge.

export interface ReconciliationRow {
  territoryCode: string;
  territoryName: string;
  level: "NATIONAL" | "DEPARTEMENT" | "COMMUNE";
  cropCode: string;
  cropName: string;
  sourceId: string;
  campaignCode: string;
  reference: string | null;
  officialHa: number;
  /** Surface déclarée au registre pour la campagne ouverte, dans ce territoire. */
  registryHa: number;
  /** Part de la surface officielle déclarée au registre ; null si la surface officielle est nulle. */
  registryShare: number | null;
  /**
   * Estimation par sondage du groupe de la culture dans la commune d'enquête, face à la somme
   * officielle des cultures du groupe ; null hors des communes d'enquête.
   */
  survey: {
    group: string;
    officialGroupHa: number;
    estimate: Pick<TargetEstimate, "areaHa" | "marginHa" | "status">;
    /** Vrai si le chiffre officiel tombe dans l'intervalle à 95 % de l'estimation. */
    withinMargin: boolean;
  } | null;
  /** Vrai si la campagne officielle est la campagne ouverte : sinon l'écart reste indicatif. */
  sameCampaign: boolean;
}

export interface OfficialImportSummary {
  sourceId: string;
  campaignCode: string;
  rows: number;
  lastImportedAt: Date;
}

export interface OfficialReconciliation {
  openCampaignCode: string;
  imports: OfficialImportSummary[];
  rows: ReconciliationRow[];
}

const officialSchema = z.object({
  source_id: z.string(),
  campaign_code: z.string(),
  level: z.enum(["NATIONAL", "DEPARTEMENT", "COMMUNE"]),
  territory_code: z.string(),
  crop_code: z.string(),
  crop_name: z.string(),
  value: z.coerce.number(),
  reference: z.string().nullable(),
});

const declaredSchema = z.object({
  commune_code: z.string(),
  departement_code: z.string(),
  crop_code: z.string(),
  area_ha: z.coerce.number(),
});

/** Vue du ministère ; null hors de la portée nationale ou sans campagne ouverte. */
export async function getOfficialReconciliation(
  actor: Actor,
): Promise<OfficialReconciliation | null> {
  if (scopeFilter(actor, "farm.read").kind !== "all") return null;
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true, code: true },
  });
  if (!campaign) return null;

  const [imports, officialRaw, declaredRaw, departements, communes, survey] = await Promise.all([
    prisma.officialCropStatistic.groupBy({
      by: ["sourceId", "campaignCode"],
      _count: { _all: true },
      _max: { importedAt: true },
      orderBy: [{ campaignCode: "desc" }, { sourceId: "asc" }],
    }),
    // Dernière campagne connue de chaque source, territoire et culture.
    prisma.$queryRaw<unknown[]>`
      SELECT DISTINCT ON (s."source_id", s."territory_code", s."crop_id")
             s."source_id", s."campaign_code", s."level"::text AS level, s."territory_code",
             c."code" AS crop_code, c."name_fr" AS crop_name, s."value", s."reference"
        FROM "official_crop_statistic" s
        JOIN "crop" c ON c."id" = s."crop_id"
       WHERE s."metric" = 'AREA_HA'
       ORDER BY s."source_id", s."territory_code", s."crop_id", s."campaign_code" DESC`,
    prisma.$queryRaw<unknown[]>`
      SELECT co."code" AS commune_code, d."code" AS departement_code, c."code" AS crop_code,
             sum(pc."area_ha") AS area_ha
        FROM "parcel_crop" pc
        JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
        JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
        JOIN "commune" co ON co."id" = f."commune_id"
        JOIN "departement" d ON d."id" = co."departement_id"
        JOIN "crop" c ON c."id" = pc."crop_id"
       WHERE pc."campaign_id" = ${campaign.id}::uuid AND pc."archived_at" IS NULL
       GROUP BY co."code", d."code", c."code"`,
    prisma.departement.findMany({ select: { code: true, name: true } }),
    prisma.commune.findMany({ select: { code: true, name: true } }),
    getSurveyEstimates(actor),
  ]);
  const official = officialRaw.map((row) => officialSchema.parse(row));
  const declared = declaredRaw.map((row) => declaredSchema.parse(row));

  const registry = new Map<string, number>();
  const add = (territory: string, crop: string, area: number) => {
    const key = `${territory}|${crop}`;
    registry.set(key, (registry.get(key) ?? 0) + area);
  };
  for (const row of declared) {
    add(row.commune_code, row.crop_code, row.area_ha);
    add(row.departement_code, row.crop_code, row.area_ha);
    add("BJ", row.crop_code, row.area_ha);
  }
  const names = new Map<string, string>([["BJ", "Bénin"]]);
  for (const entry of [...departements, ...communes]) names.set(entry.code, entry.name);

  // Somme officielle de chaque groupe de cultures, par source, campagne et commune.
  const groupSums = new Map<string, number>();
  for (const row of official) {
    const group = cropGroupOf(row.crop_code);
    if (!group || row.level !== "COMMUNE") continue;
    const key = [row.source_id, row.campaign_code, row.territory_code, group].join("|");
    groupSums.set(key, (groupSums.get(key) ?? 0) + row.value);
  }
  const surveyByCommune = new Map(
    (survey?.communes ?? []).map((commune) => [commune.code, commune.targets]),
  );

  const rows: ReconciliationRow[] = official.map((row) => {
    const registryHa = registry.get(`${row.territory_code}|${row.crop_code}`) ?? 0;
    const group = cropGroupOf(row.crop_code);
    const estimate =
      row.level === "COMMUNE" && group
        ? surveyByCommune.get(row.territory_code)?.find((entry) => entry.target === group)
        : undefined;
    const officialGroupHa = group
      ? (groupSums.get([row.source_id, row.campaign_code, row.territory_code, group].join("|")) ??
        row.value)
      : row.value;
    return {
      territoryCode: row.territory_code,
      territoryName: names.get(row.territory_code) ?? row.territory_code,
      level: row.level,
      cropCode: row.crop_code,
      cropName: row.crop_name,
      sourceId: row.source_id,
      campaignCode: row.campaign_code,
      reference: row.reference,
      officialHa: row.value,
      registryHa: Math.round(registryHa * 10) / 10,
      registryShare: row.value > 0 ? registryHa / row.value : null,
      survey:
        estimate && group
          ? {
              group,
              officialGroupHa,
              estimate: {
                areaHa: estimate.areaHa,
                marginHa: estimate.marginHa,
                status: estimate.status,
              },
              withinMargin: Math.abs(officialGroupHa - estimate.areaHa) <= estimate.marginHa,
            }
          : null,
      sameCampaign: row.campaign_code === campaign.code,
    };
  });
  const levelRank = { NATIONAL: 0, DEPARTEMENT: 1, COMMUNE: 2 } as const;
  rows.sort(
    (a, b) =>
      levelRank[a.level] - levelRank[b.level] ||
      a.territoryName.localeCompare(b.territoryName) ||
      a.cropName.localeCompare(b.cropName),
  );
  return {
    openCampaignCode: campaign.code,
    imports: imports.map((entry) => ({
      sourceId: entry.sourceId,
      campaignCode: entry.campaignCode,
      rows: entry._count._all,
      lastImportedAt: entry._max.importedAt!,
    })),
    rows,
  };
}
