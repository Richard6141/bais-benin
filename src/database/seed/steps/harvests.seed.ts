import type { PrismaClient } from "@/generated/prisma/client";

// Historique de récoltes du registre synthétique. Sans déclarations, les chiffres de production
// du pilotage et le palmarès des producteurs resteraient vides. Tout est calculé en SQL (quelques
// dizaines de milliers de lignes, sans passer par la mémoire du processus) et déterministe : un
// tirage pseudo-aléatoire dérivé du md5 de l'identifiant, donc le même jeu à chaque exécution.
//
// - La campagne close la plus récente garde ses cultures ; la campagne close qui la précède
//   reçoit le même assolement (surfaces légèrement modulées), pour un historique sur deux ans.
// - Environ 78 % des cultures des campagnes closes ont une récolte déclarée : surface × rendement
//   type de la culture × aléa de la parcelle × savoir-faire du producteur × effet commune-année.
//   Le savoir-faire est tiré par exploitation : un bon producteur l'est sur toutes ses parcelles
//   et d'une année sur l'autre, ce qui donne un palmarès cohérent.
// - Une exploitation vérifiée (agent ou terrain) voit ses récoltes déclarées par l'agent.

const RANDOM = (seed: string) =>
  `((('x' || substr(md5(${seed}), 1, 7))::bit(28)::int)::float8 / 268435455.0)`;

export interface HarvestSeedSummary {
  historyParcelCrops: number;
  declarations: number;
}

export async function seedSyntheticHarvests(prisma: PrismaClient): Promise<HarvestSeedSummary> {
  const campaigns = await prisma.agriculturalCampaign.findMany({
    where: { status: "CLOSED", archivedAt: null },
    orderBy: { startYear: "desc" },
    select: { id: true, code: true, startYear: true },
  });
  const [latest, previous] = campaigns;
  if (!latest) return { historyParcelCrops: 0, declarations: 0 };

  let historyParcelCrops = 0;
  if (previous && previous.startYear === latest.startYear - 1) {
    historyParcelCrops = await prisma.$executeRawUnsafe(
      `INSERT INTO "parcel_crop" (
         "id", "parcel_id", "crop_id", "campaign_id", "sub_season", "area_ha", "stage", "variety",
         "source_id", "source_date", "reliability", "created_at", "updated_at")
       SELECT md5(pc."id"::text || ':' || $2)::uuid, pc."parcel_id", pc."crop_id", $1::uuid,
              pc."sub_season",
              round((pc."area_ha" * (0.85 + 0.3 * ${RANDOM(`pc."id"::text || ':area'`)}))::numeric, 3),
              'HARVESTED', pc."variety", pc."source_id", pc."source_date", pc."reliability",
              now(), now()
       FROM "parcel_crop" pc
       WHERE pc."campaign_id" = $3::uuid AND pc."source_id" = 'BAIS_SEED' AND pc."archived_at" IS NULL
       ON CONFLICT DO NOTHING`,
      previous.id,
      previous.code,
      latest.id,
    );
  }

  const closedIds = campaigns.slice(0, 2).map((c) => c.id);
  const declarations = await prisma.$executeRawUnsafe(
    `INSERT INTO "production_declaration" (
       "id", "parcel_crop_id", "declared_quantity", "unit", "quantity_kg", "declared_on",
       "declared_by", "losses_pct", "source_id", "source_date", "reliability",
       "created_at", "updated_at")
     SELECT md5(pc."id"::text || ':harvest')::uuid, pc."id", q.kg, 'KG', q.kg,
            LEAST(ac."ends_on" - floor(${RANDOM(`pc."id"::text || ':date'`)} * 90)::int, current_date),
            CASE WHEN f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')
                 THEN 'AGENT'::"DeclaredBy" ELSE 'FARMER'::"DeclaredBy" END,
            CASE WHEN ${RANDOM(`pc."id"::text || ':loss'`)} < 0.2
                 THEN round((5 + 20 * ${RANDOM(`pc."id"::text || ':losspct'`)})::numeric, 2) END,
            'BAIS_SEED', pc."source_date", pc."reliability", now(), now()
     FROM "parcel_crop" pc
     JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
     JOIN "crop" c ON c."id" = pc."crop_id"
     JOIN "parcel" p ON p."id" = pc."parcel_id"
     JOIN "farm" f ON f."id" = p."farm_id"
     CROSS JOIN LATERAL (
       SELECT round((
         pc."area_ha" * COALESCE(c."typical_yield_t_per_ha", 1) * 1000
         * (0.45 + 1.1 * (${RANDOM(`pc."id"::text || ':y1'`)} + ${RANDOM(`pc."id"::text || ':y2'`)}) / 2)
         * (0.75 + 0.5 * ${RANDOM(`f."id"::text || ':skill'`)})
         * (0.85 + 0.3 * ${RANDOM(`f."commune_id"::text || ':' || ac."code"`)})
       )::numeric, 0) AS kg
     ) q
     WHERE pc."campaign_id" = ANY($1::uuid[]) AND pc."source_id" = 'BAIS_SEED'
       AND pc."archived_at" IS NULL AND f."archived_at" IS NULL
       AND ${RANDOM(`pc."id"::text || ':declared'`)} < 0.78 AND q.kg > 0
     ON CONFLICT DO NOTHING`,
    closedIds,
  );

  await prisma.$executeRawUnsafe(
    `UPDATE "parcel_crop" pc SET "stage" = 'HARVESTED', "updated_at" = now()
     WHERE pc."campaign_id" = ANY($1::uuid[]) AND pc."source_id" = 'BAIS_SEED'
       AND pc."stage" <> 'HARVESTED'
       AND EXISTS (SELECT 1 FROM "production_declaration" d
                   WHERE d."parcel_crop_id" = pc."id" AND d."archived_at" IS NULL)`,
    closedIds,
  );

  return { historyParcelCrops, declarations };
}
