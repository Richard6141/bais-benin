import { prisma } from "@/database/client";

// Import d'une saison de feux passée (ADR-0039) : détections déjà en base sur la période, pour
// que le même feu ne soit jamais écrit deux fois (même fusion que l'ingestion, ADR-0022).

/** Points vérifiés par requête : deux tableaux de 5 000 flottants, loin des limites du serveur. */
const INSIDE_BATCH = 5_000;

/**
 * Rangs des points qui tombent dans une commune du Bénin : l'emprise de lecture déborde sur les
 * pays voisins, et une détection hors frontière ne serait jamais écrite. Les écarter avant la
 * fusion aligne le décompte d'un essai (--dry-run) sur l'import réel.
 */
export async function pointsInsideCommunes(
  points: readonly { latitude: number; longitude: number }[],
): Promise<Set<number>> {
  const inside = new Set<number>();
  for (let start = 0; start < points.length; start += INSIDE_BATCH) {
    const batch = points.slice(start, start + INSIDE_BATCH);
    const rows = await prisma.$queryRaw<{ i: bigint }[]>`
      SELECT t.i
        FROM unnest(${batch.map((point) => point.latitude)}::float8[],
                    ${batch.map((point) => point.longitude)}::float8[])
             WITH ORDINALITY AS t(lat, lon, i)
       WHERE EXISTS (
         SELECT 1 FROM "commune" c
          WHERE c."archived_at" IS NULL
            AND ST_Intersects(c."geom", ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography)
       )`;
    for (const row of rows) inside.add(start + Number(row.i) - 1);
  }
  return inside;
}

export async function fireDetectionsBetween(from: Date, to: Date) {
  const rows = await prisma.fireDetection.findMany({
    where: { detectedAt: { gte: from, lt: to } },
    select: {
      id: true,
      detectedAt: true,
      latitude: true,
      longitude: true,
      sensors: true,
      confidence: true,
      frpMw: true,
      brightnessK: true,
      sourceKeys: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    frpMw: row.frpMw === null ? null : Number(row.frpMw),
    brightnessK: row.brightnessK === null ? null : Number(row.brightnessK),
  }));
}
