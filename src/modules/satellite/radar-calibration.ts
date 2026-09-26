import { z } from "zod";
import { addProcessingUnits, reserveProcessingRequest } from "@/database/sql/satellite.sql";
import { sampleParcelsForCalibration } from "@/database/sql/vegetation.sql";
import {
  RemoteSensingProviderError,
  type PolygonGeometry,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";
import { processingBudget } from "./imagery";
import { periodOf } from "./periods";

// Mesure du coût du radar Sentinel-1 (ADR-0019), avant d'activer SATELLITE_RADAR_FALLBACK : une
// requête Statistical radar par parcelle d'un échantillon, sur les 120 derniers jours (la saison
// des pluies en cours), avec les unités de traitement décomptées par Copernicus. Chaque requête
// réserve sa place dans la part des statistiques, comme la tâche quotidienne.

const WINDOW_DAYS = 120;

const geometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

export interface RadarCalibrationEntry {
  parcelCode: string;
  areaHa: number;
  processingUnits: number | null;
  intervals: number;
  validIntervals: number;
  rviMin: number | null;
  rviMax: number | null;
  error?: string;
}

export interface RadarCalibrationResult {
  provider: string;
  window: { from: string; to: string };
  requests: number;
  processingUnits: {
    total: number;
    perRequestMean: number | null;
    perRequestMax: number | null;
    /** Requêtes dont Copernicus n'a pas indiqué les unités. */
    unreported: number;
  };
  stoppedBy: "share-exhausted" | "units-exhausted" | "throttled" | null;
  results: RadarCalibrationEntry[];
}

export async function measureRadarCost(options: {
  provider: RemoteSensingProvider;
  limit: number;
  now?: Date;
}): Promise<RadarCalibrationResult> {
  const now = options.now ?? new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const to = now.toISOString();
  const metered = options.provider.id === "cdse";
  const results: RadarCalibrationEntry[] = [];
  let stoppedBy: RadarCalibrationResult["stoppedBy"] = null;

  for (const parcel of await sampleParcelsForCalibration(options.limit)) {
    if (metered) {
      const reservation = await reserveProcessingRequest(
        periodOf(now),
        "STATISTICS",
        processingBudget(),
        now,
      );
      if (reservation !== "reserved") {
        stoppedBy = reservation;
        break;
      }
    }
    const entry: RadarCalibrationEntry = {
      parcelCode: parcel.parcel_code,
      areaHa: Math.round(parcel.area_ha * 100) / 100,
      processingUnits: null,
      intervals: 0,
      validIntervals: 0,
      rviMin: null,
      rviMax: null,
    };
    try {
      const radar = await options.provider.radarStatistics({
        geometry: geometrySchema.parse(JSON.parse(parcel.geometry)) as PolygonGeometry,
        from,
        to,
        intervalDays: 12,
        orbitDirection: "DESCENDING",
      });
      if (metered && radar.processingUnits) {
        await addProcessingUnits(periodOf(now), radar.processingUnits);
      }
      const values = radar.intervals
        .map((interval) => interval.rviMean)
        .filter((value): value is number => value !== null);
      entry.processingUnits = radar.processingUnits;
      entry.intervals = radar.intervals.length;
      entry.validIntervals = values.length;
      entry.rviMin = values.length > 0 ? Math.round(Math.min(...values) * 1000) / 1000 : null;
      entry.rviMax = values.length > 0 ? Math.round(Math.max(...values) * 1000) / 1000 : null;
    } catch (error) {
      if (!(error instanceof RemoteSensingProviderError)) throw error;
      entry.error = error.message;
    }
    results.push(entry);
  }

  const units = results
    .map((entry) => entry.processingUnits)
    .filter((value): value is number => value !== null);
  const total = units.reduce((sum, value) => sum + value, 0);
  return {
    provider: options.provider.id,
    window: { from, to },
    requests: results.length,
    processingUnits: {
      total: Math.round(total * 1000) / 1000,
      perRequestMean: units.length > 0 ? Math.round((total / units.length) * 1000) / 1000 : null,
      perRequestMax: units.length > 0 ? Math.max(...units) : null,
      unreported: results.length - units.length,
    },
    stoppedBy,
    results,
  };
}
