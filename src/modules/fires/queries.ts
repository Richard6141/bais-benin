import { prisma } from "@/database/client";

// Lecture des feux actifs (ADR-0022) pour la carte et le centre de veille. Donnée publique sans
// lien avec une personne : servie sans connexion, comme les limites administratives.

export type FireWindow = "24h" | "7d";

const WINDOW_MS: Record<FireWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface FireFeature {
  id: string;
  detectedAt: string;
  latitude: number;
  longitude: number;
  sensors: string[];
  confidence: string;
  frpMw: number | null;
  communeName: string;
}

export async function listFires(
  window: FireWindow,
  now: Date = new Date(),
): Promise<FireFeature[]> {
  const rows = await prisma.fireDetection.findMany({
    where: { detectedAt: { gte: new Date(now.getTime() - WINDOW_MS[window]) } },
    orderBy: { detectedAt: "desc" },
    take: 20_000,
    select: {
      id: true,
      detectedAt: true,
      latitude: true,
      longitude: true,
      sensors: true,
      confidence: true,
      frpMw: true,
      commune: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    detectedAt: row.detectedAt.toISOString(),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    sensors: row.sensors,
    confidence: row.confidence,
    frpMw: row.frpMw === null ? null : Number(row.frpMw),
    communeName: row.commune.name,
  }));
}

/** Collection GeoJSON des feux, pour MapLibre. */
export function firesToGeoJson(fires: readonly FireFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: fires.map((fire) => ({
      type: "Feature" as const,
      id: fire.id,
      geometry: { type: "Point" as const, coordinates: [fire.longitude, fire.latitude] },
      properties: {
        detectedAt: fire.detectedAt,
        sensors: fire.sensors.join(","),
        confidence: fire.confidence,
        frp: fire.frpMw ?? 0,
        commune: fire.communeName,
      },
    })),
  };
}

export interface FireFreshness {
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSuccessAt: string | null;
  failedFiles: string[];
}

export async function fireFreshness(): Promise<FireFreshness> {
  const [last, success] = await Promise.all([
    prisma.fireIngestionRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, failedFiles: true },
    }),
    prisma.fireIngestionRun.findFirst({
      where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);
  return {
    lastRunAt: last?.startedAt.toISOString() ?? null,
    lastStatus: last?.status ?? null,
    lastSuccessAt: success?.finishedAt?.toISOString() ?? null,
    failedFiles: last?.failedFiles ?? [],
  };
}
