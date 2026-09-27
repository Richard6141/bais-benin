import { prisma } from "@/database/client";
import { fireDetectionsBetween } from "@/database/sql/fire-archive.sql";
import { insertFireDetections } from "@/database/sql/fires.sql";
import { parseFirmsCsv } from "@/services/fires/firms-public";
import type { FireSensorCode, RawFireDetection } from "@/services/ports/fire-detection-provider";
import {
  ARCHIVE_SOURCES,
  apiAreaPath,
  apiChunks,
  archiveSeasonWindow,
  parseAvailability,
  pickApiSource,
  yearlyArchivePath,
} from "./archive-sources";
import { BENIN_FIRE_BBOX } from "./ingest";
import { mergeDetections, type FireConfidenceCode, type FireRecord } from "./merge";

// Import d'une saison de feux passée (ADR-0039) : détections NASA FIRMS de novembre à avril,
// par l'API avec une clé, sinon par les archives annuelles publiques. Même fusion entre satellites
// et même rattachement aux communes que l'ingestion (ADR-0022). Aucune alerte n'est évaluée et
// aucun passage d'ingestion n'est écrit : ce sont des feux passés, pas une lecture en direct.
// Idempotent : une ligne déjà lue (même capteur, heure et position) n'est jamais comptée deux fois.

const REQUEST_TIMEOUT_MS = 120_000;
/** Pause entre deux requêtes de l'API : la limite est de 5 000 requêtes par tranche de 10 minutes. */
const API_PAUSE_MS = 250;
/** Lignes écrites par requête : chacune porte dix paramètres, PostgreSQL en accepte 65 535. */
const INSERT_BATCH = 500;

export interface FireArchiveResult {
  season: number;
  mode: "api" | "yearly";
  status: "imported" | "missing" | "dry-run";
  /** Fichiers annuels absents (mode sans clé) ou tranches sans jeu disponible (mode API). */
  missing: string[];
  requests: number;
  fetched: number;
  created: number;
  merged: number;
  skipped: number;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function readText(fetchImpl: Fetch, url: string): Promise<{ status: number; text: string }> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { status: response.status, text: await response.text() };
}

/** Réponse texte d'erreur de l'API (« Invalid MAP_KEY. », « Invalid day range… »). */
function apiError(text: string): string | null {
  const first = text.trimStart().slice(0, 120);
  return /^invalid|^error|exceed/i.test(first) ? first.split(/\r?\n/)[0]! : null;
}

async function fromYearlyArchives(
  season: number,
  baseUrl: string,
  fetchImpl: Fetch,
): Promise<{ detections: RawFireDetection[]; missing: string[]; requests: number }> {
  const detections: RawFireDetection[] = [];
  const missing: string[] = [];
  let requests = 0;
  for (const source of ARCHIVE_SOURCES) {
    if (!source.yearly) continue;
    for (const year of [season, season + 1]) {
      const path = yearlyArchivePath(source.yearly, year);
      const { status, text } = await readText(fetchImpl, `${baseUrl}${path}`);
      requests += 1;
      if (status !== 200) {
        missing.push(path);
        continue;
      }
      detections.push(...parseFirmsCsv(text, source.sensor, BENIN_FIRE_BBOX));
    }
  }
  return { detections, missing, requests };
}

async function fromApi(
  season: number,
  mapKey: string,
  baseUrl: string,
  fetchImpl: Fetch,
  pause: (ms: number) => Promise<void>,
): Promise<{ detections: RawFireDetection[]; missing: string[]; requests: number }> {
  const window = archiveSeasonWindow(season);
  const availability = await readText(
    fetchImpl,
    `${baseUrl}/api/data_availability/csv/${encodeURIComponent(mapKey)}/ALL`,
  );
  const refused = apiError(availability.text);
  if (availability.status !== 200 || refused) {
    throw new Error(`FIRMS refuse la clé : ${refused ?? `HTTP ${availability.status}`}`);
  }
  const available = parseAvailability(availability.text);
  const detections: RawFireDetection[] = [];
  const missing: string[] = [];
  let requests = 1;
  for (const source of ARCHIVE_SOURCES) {
    for (const chunk of apiChunks(window.from, window.to)) {
      const dataset = pickApiSource(source.api, available, chunk);
      if (!dataset) {
        missing.push(`${source.sensor} ${chunk.date} (${chunk.days} j)`);
        continue;
      }
      const { status, text } = await readText(
        fetchImpl,
        `${baseUrl}${apiAreaPath(mapKey, dataset, BENIN_FIRE_BBOX, chunk)}`,
      );
      requests += 1;
      const error = apiError(text);
      if (status !== 200 || error) {
        throw new Error(`FIRMS, ${dataset} ${chunk.date} : ${error ?? `HTTP ${status}`}`);
      }
      detections.push(...parseFirmsCsv(text, source.sensor, BENIN_FIRE_BBOX));
      await pause(API_PAUSE_MS);
    }
  }
  return { detections, missing, requests };
}

function toRecord(row: Awaited<ReturnType<typeof fireDetectionsBetween>>[number]): FireRecord {
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

export async function importFireArchive(options: {
  season: number;
  mapKey?: string | null;
  baseUrl: string;
  fetchImpl?: Fetch;
  dryRun?: boolean;
  pause?: (ms: number) => Promise<void>;
}): Promise<FireArchiveResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pause =
    options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const mode = options.mapKey ? "api" : "yearly";
  const window = archiveSeasonWindow(options.season);
  const read = options.mapKey
    ? await fromApi(options.season, options.mapKey, options.baseUrl, fetchImpl, pause)
    : await fromYearlyArchives(options.season, options.baseUrl, fetchImpl);
  const base = {
    season: options.season,
    mode,
    missing: read.missing,
    requests: read.requests,
  } as const;
  // Sans clé, une saison incomplète n'est pas écrite : mieux vaut rien qu'une demi-saison.
  if (mode === "yearly" && read.missing.length > 0) {
    return { ...base, status: "missing", fetched: 0, created: 0, merged: 0, skipped: 0 };
  }
  const inSeason = read.detections.filter(
    (row) => row.acquiredAt >= window.from && row.acquiredAt < window.to,
  );
  const existing = await fireDetectionsBetween(window.from, window.to);
  const { created, updated, skipped } = mergeDetections(existing.map(toRecord), inSeason, () =>
    crypto.randomUUID(),
  );
  if (options.dryRun) {
    return {
      ...base,
      status: "dry-run",
      fetched: inSeason.length,
      created: created.length,
      merged: updated.length,
      skipped,
    };
  }
  let inserted = 0;
  for (let start = 0; start < created.length; start += INSERT_BATCH) {
    const ids = await insertFireDetections(created.slice(start, start + INSERT_BATCH));
    inserted += ids.length;
  }
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
  return {
    ...base,
    status: "imported",
    fetched: inSeason.length,
    created: inserted,
    merged: updated.length,
    skipped,
  };
}
