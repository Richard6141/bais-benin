import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import { FTW_SOURCE_ID } from "@/database/reference-fields-store";

// Qualité des contours de référence face aux parcelles relevées au GPS (ADR-0029). Pour chaque
// parcelle mesurée (marche GPS ou dessin sur carte) située dans la zone couverte par des champs de
// référence : meilleur recouvrement IoU avec un seul champ, et part de la parcelle couverte par
// l'ensemble des champs. Les surfaces se calculent en UTM 31N (EPSG:32631), qui couvre le Bénin.

export interface ReferenceQuality {
  parcels: number;
  found: number;
  foundShare: number | null;
  medianIou: number | null;
  medianCoverage: number | null;
  iouThreshold: number;
}

export const IOU_FOUND_THRESHOLD = 0.5;

interface Options {
  year?: number;
  /** Limite la mesure à ces parcelles (tests, échantillon). */
  parcelIds?: readonly string[];
  iouThreshold?: number;
}

export async function measureReferenceQuality(options: Options = {}): Promise<ReferenceQuality> {
  const threshold = options.iouThreshold ?? IOU_FOUND_THRESHOLD;
  const year = options.year ?? 2025;
  const scope =
    options.parcelIds && options.parcelIds.length > 0
      ? Prisma.sql`AND p."id" IN (${Prisma.join(options.parcelIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      parcels: bigint;
      found: bigint;
      median_iou: number | null;
      median_coverage: number | null;
    }[]
  >`
    WITH covered AS (
      SELECT ST_Envelope(ST_Collect("geom"::geometry)) AS envelope
      FROM "reference_field" WHERE "source_id" = ${FTW_SOURCE_ID} AND "year" = ${year}
    ),
    measured AS (
      SELECT p."id", ST_Transform(p."geom"::geometry, 32631) AS g, p."geom" AS geog
      FROM "parcel" p, covered
      WHERE p."geom" IS NOT NULL AND p."capture_method" IN ('GPS_WALK', 'MAP_DRAW')
        AND p."archived_at" IS NULL
        AND ST_Intersects(p."geom"::geometry, covered.envelope)
        ${scope}
    ),
    scored AS (
      SELECT m."id",
        COALESCE((
          SELECT MAX(
            ST_Area(ST_Intersection(m.g, ST_Transform(f."geom"::geometry, 32631)))
            / NULLIF(ST_Area(ST_Union(m.g, ST_Transform(f."geom"::geometry, 32631))), 0))
          FROM "reference_field" f
          WHERE f."source_id" = ${FTW_SOURCE_ID} AND f."year" = ${year}
            AND ST_Intersects(f."geom", m.geog)
        ), 0) AS best_iou,
        COALESCE((
          SELECT ST_Area(ST_Intersection(m.g, ST_Union(ST_Transform(f."geom"::geometry, 32631))))
                 / NULLIF(ST_Area(m.g), 0)
          FROM "reference_field" f
          WHERE f."source_id" = ${FTW_SOURCE_ID} AND f."year" = ${year}
            AND ST_Intersects(f."geom", m.geog)
        ), 0) AS coverage
      FROM measured m
    )
    SELECT COUNT(*) AS parcels,
      COUNT(*) FILTER (WHERE best_iou >= ${threshold}) AS found,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY best_iou) AS median_iou,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY coverage) AS median_coverage
    FROM scored`;
  const row = rows[0];
  const parcels = Number(row?.parcels ?? 0);
  const found = Number(row?.found ?? 0);
  return {
    parcels,
    found,
    foundShare: parcels > 0 ? found / parcels : null,
    medianIou: row?.median_iou ?? null,
    medianCoverage: row?.median_coverage ?? null,
    iouThreshold: threshold,
  };
}
