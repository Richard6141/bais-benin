import { prisma } from "@/database/client";

// Import d'une saison de feux passée (ADR-0039) : détections déjà en base sur la période, pour
// que le même feu ne soit jamais écrit deux fois (même fusion que l'ingestion, ADR-0022).

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
