import { prisma } from "@/database/client";
import {
  readCommuneLocations,
  upsertWeatherRows,
  type WeatherRow,
} from "@/database/sql/weather.sql";
import { recordAudit } from "@/modules/audit";
import {
  WeatherProviderError,
  type WeatherProvider,
  type WeatherSeries,
} from "@/services/ports/weather-provider";
import { beninToday } from "./dates";

// Ingestion quotidienne de la météo par commune (docs/modules/monitoring-parcours-ux.md §2.E).
// Le fournisseur principal (Open-Meteo) est interrogé avec trois tentatives ; en cas d'échec,
// la fixture prend le relais et tout ce qui en sort est marqué SYNTHETIC : les alertes
// calculées dessus restent dans l'application et ne partent jamais par message.

export interface IngestionOptions {
  primary: WeatherProvider;
  fallback?: WeatherProvider;
  today?: string;
  pastDays?: number;
  forecastDays?: number;
  retries?: number;
  /** Attente entre deux tentatives, en millisecondes (réduite en test). */
  retryDelayMs?: number;
  actorId?: string | null;
}

export interface IngestionResult {
  runId: string;
  provider: WeatherProvider["id"];
  fallback: boolean;
  referenceDate: string;
  communes: number;
  communesFailed: number;
  rows: number;
  error: string | null;
}

async function fetchWithRetry(
  provider: WeatherProvider,
  request: Parameters<WeatherProvider["fetchDaily"]>[0],
  retries: number,
  delayMs: number,
): Promise<WeatherSeries[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await provider.fetchDaily(request);
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof WeatherProviderError) || error.retryable;
      if (!retryable) break;
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function runWeatherIngestion(options: IngestionOptions): Promise<IngestionResult> {
  const today = options.today ?? beninToday();
  const pastDays = options.pastDays ?? 35;
  const forecastDays = options.forecastDays ?? 8;
  const communes = await readCommuneLocations();
  const byCode = new Map(communes.map((c) => [c.code, c]));
  const run = await prisma.ingestionRun.create({
    data: { provider: options.primary.id, referenceDate: new Date(`${today}T00:00:00Z`) },
  });

  // Aucune exécution ne doit rester « en cours » : toute erreur la marque en échec avec sa cause.
  try {
    const request = {
      locations: communes.map((c) => ({
        key: c.code,
        latitude: c.lat,
        longitude: c.lng,
        zoneCode: c.zone_code,
      })),
      today,
      pastDays,
      forecastDays,
    };

    let provider = options.primary;
    let fallback = false;
    let error: string | null = null;
    let series: WeatherSeries[];
    try {
      series = await fetchWithRetry(
        provider,
        request,
        options.retries ?? 3,
        options.retryDelayMs ?? 2000,
      );
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Fournisseur météo indisponible";
      if (!options.fallback || options.fallback === options.primary) {
        await prisma.ingestionRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error,
            communesFailed: communes.length,
          },
        });
        throw cause;
      }
      provider = options.fallback;
      fallback = true;
      series = await provider.fetchDaily(request);
      await recordAudit({
        action: "monitoring.ingest.fallback",
        actorId: options.actorId ?? null,
        resourceType: "ingestion_run",
        resourceId: run.id,
        details: { primary: options.primary.id, reason: error },
      });
    }

    const rows: WeatherRow[] = [];
    let communesFailed = 0;
    for (const item of series) {
      const commune = byCode.get(item.key);
      if (!commune || item.days.length === 0) {
        communesFailed += 1;
        continue;
      }
      for (const day of item.days) {
        rows.push({
          communeId: commune.id,
          observedOn: day.date,
          kind: day.kind,
          // Une journée observée n'a qu'une valeur : sa date d'émission est sa propre date.
          issuedOn: day.kind === "OBSERVED" ? day.date : today,
          tempMaxC: day.tempMaxC,
          tempMinC: day.tempMinC,
          precipitationMm: day.precipitationMm,
          et0Mm: day.et0Mm,
          relativeHumidityPct: day.relativeHumidityPct,
          windKmh: day.windKmh,
          sourceId: provider.provenance.sourceId,
          reliability: provider.provenance.reliability,
          ingestionRunId: run.id,
        });
      }
    }
    communesFailed += communes.length - series.length;
    const written = await upsertWeatherRows(rows);

    const status = communesFailed === 0 ? (fallback ? "PARTIAL" : "SUCCEEDED") : "PARTIAL";
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        provider: provider.id,
        fallback,
        communesOk: communes.length - communesFailed,
        communesFailed,
        error,
      },
    });
    await recordAudit({
      action: "monitoring.ingest.completed",
      actorId: options.actorId ?? null,
      resourceType: "ingestion_run",
      resourceId: run.id,
      details: { provider: provider.id, fallback, rows: written, communesFailed },
    });

    return {
      runId: run.id,
      provider: provider.id,
      fallback,
      referenceDate: today,
      communes: communes.length,
      communesFailed,
      rows: written,
      error,
    };
  } catch (cause) {
    const current = await prisma.ingestionRun.findUnique({ where: { id: run.id } });
    if (current?.status === "RUNNING") {
      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: cause instanceof Error ? cause.message : "Échec de l'ingestion",
        },
      });
    }
    throw cause;
  }
}
