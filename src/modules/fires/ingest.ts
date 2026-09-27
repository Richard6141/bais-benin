import { prisma } from "@/database/client";
import { insertFireDetections, recentFireDetections } from "@/database/sql/fires.sql";
import { logger } from "@/lib/logger";
import type {
  BBox,
  FireDetectionProvider,
  FireSensorCode,
} from "@/services/ports/fire-detection-provider";
import { mergeDetections, type FireConfidenceCode, type FireRecord } from "./merge";

// Ingestion des feux actifs (ADR-0022), toutes les 30 minutes : lecture des fichiers 24 h de
// FIRMS dans l'emprise du Bénin, dédoublonnage avec les détections des 36 dernières heures,
// écriture des nouvelles (rattachées à leur commune, celles hors frontière écartées) et mise à
// jour de celles qu'un autre capteur complète. Chaque passage est tracé pour la fraîcheur.

/** Emprise du Bénin, avec une marge ; la frontière exacte est appliquée par les communes. */
export const BENIN_FIRE_BBOX: BBox = [0.7, 6.1, 3.95, 12.5];
const DEDUP_WINDOW_MS = 36 * 60 * 60 * 1000;
/**
 * Détections gardées deux ans (ADR-0039) : la prévention de la saison des feux compare les
 * communes sur la saison sèche passée, qui commence jusqu'à dix-huit mois plus tôt.
 */
const RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export interface FireIngestionSummary {
  runId: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  fetched: number;
  created: number;
  merged: number;
  failedFiles: string[];
  /** Détections nouvelles ou complétées : l'évaluation des alertes part d'elles. */
  changedIds: string[];
}

function toRecord(row: Awaited<ReturnType<typeof recentFireDetections>>[number]): FireRecord {
  return {
    id: row.id,
    detectedAt: row.detectedAt,
    latitude: row.latitude,
    longitude: row.longitude,
    sensors: row.sensors as FireSensorCode[],
    confidence: row.confidence as FireConfidenceCode,
    frpMw: row.frpMw,
    brightnessK: row.brightnessK,
    daynight: null,
    sourceKeys: row.sourceKeys,
  };
}

export async function runFireIngestion(deps: {
  provider: FireDetectionProvider;
  now?: Date;
}): Promise<FireIngestionSummary> {
  const now = deps.now ?? new Date();
  const run = await prisma.fireIngestionRun.create({
    data: { startedAt: now },
    select: { id: true },
  });
  try {
    const { detections, failedFiles } = await deps.provider.fetchRecent(BENIN_FIRE_BBOX);
    // Les quatre fichiers illisibles : échec ; certains seulement : passage partiel.
    const allFailed = failedFiles.length >= 4;
    const existing = await recentFireDetections(new Date(now.getTime() - DEDUP_WINDOW_MS));
    const { created, updated } = mergeDetections(existing.map(toRecord), detections, () =>
      crypto.randomUUID(),
    );
    const insertedIds = await insertFireDetections(
      created.map((record) => ({ ...record, sensors: record.sensors })),
    );
    for (const record of updated) {
      await prisma.fireDetection.update({
        where: { id: record.id },
        data: {
          detectedAt: record.detectedAt,
          sensors: record.sensors,
          confidence: record.confidence,
          frpMw: record.frpMw,
          brightnessK: record.brightnessK,
          sourceKeys: record.sourceKeys,
        },
      });
    }
    await prisma.fireDetection.deleteMany({
      where: { detectedAt: { lt: new Date(now.getTime() - RETENTION_MS) } },
    });
    const status = allFailed ? "FAILED" : failedFiles.length > 0 ? "PARTIAL" : "SUCCEEDED";
    await prisma.fireIngestionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status,
        fetched: detections.length,
        created: insertedIds.length,
        merged: updated.length,
        failedFiles,
      },
    });
    return {
      runId: run.id,
      status,
      fetched: detections.length,
      created: insertedIds.length,
      merged: updated.length,
      failedFiles,
      changedIds: [...insertedIds, ...updated.map((record) => record.id)],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    logger.error({ err: error }, "Ingestion des feux actifs impossible");
    await prisma.fireIngestionRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "FAILED", error: message.slice(0, 500) },
    });
    return {
      runId: run.id,
      status: "FAILED",
      fetched: 0,
      created: 0,
      merged: 0,
      failedFiles: [],
      changedIds: [],
    };
  }
}
