import type { FireSensorCode } from "@/services/ports/fire-detection-provider";

// Sources d'une saison de feux passée (ADR-0039), en fonctions pures : période de la saison,
// fichiers annuels publics (sans clé) et requêtes de l'API FIRMS (avec clé), tranche par tranche.

export interface ArchiveSource {
  sensor: FireSensorCode;
  /** Répertoire des archives annuelles par pays ; null si FIRMS n'en publie pas. */
  yearly: string | null;
  /** Jeux de l'API, du traitement standard (SP) au quasi temps réel (NRT). */
  api: readonly string[];
}

export const ARCHIVE_SOURCES: readonly ArchiveSource[] = [
  { sensor: "VIIRS_SNPP", yearly: "viirs-snpp", api: ["VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"] },
  { sensor: "VIIRS_NOAA20", yearly: "viirs-jpss1", api: ["VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"] },
  { sensor: "VIIRS_NOAA21", yearly: null, api: ["VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"] },
  { sensor: "MODIS", yearly: "modis", api: ["MODIS_SP", "MODIS_NRT"] },
];

/** L'API FIRMS rend au plus 5 jours par requête (vérifié le 27 septembre 2026). */
export const API_MAX_DAYS = 5;

/**
 * Saison sèche qui commence en novembre de `startYear` : du 1er novembre au 1er mai suivant, à
 * l'heure du Bénin (UTC+1).
 */
export function archiveSeasonWindow(startYear: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(startYear, 10, 1) - 3_600_000),
    to: new Date(Date.UTC(startYear + 1, 4, 1) - 3_600_000),
  };
}

/** Dernière saison sèche terminée à cette date (la saison passée, en septembre 2026 : 2025). */
export function lastCompleteSeason(now: Date): number {
  const local = new Date(now.getTime() + 3_600_000);
  const year = local.getUTCFullYear();
  return local.getUTCMonth() + 1 >= 5 ? year - 1 : year - 2;
}

export function yearlyArchivePath(directory: string, year: number): string {
  return `/data/country/${directory}/${year}/${directory}_${year}_Benin.csv`;
}

export interface ApiChunk {
  /** Premier jour de la tranche, AAAA-MM-JJ (UTC, comme les dates FIRMS). */
  date: string;
  days: number;
}

/** Tranches de 5 jours au plus couvrant la période, jours UTC de FIRMS. */
export function apiChunks(from: Date, to: Date, maxDays = API_MAX_DAYS): ApiChunk[] {
  const day = 86_400_000;
  const start = Math.floor(from.getTime() / day) * day;
  const end = Math.ceil(to.getTime() / day) * day;
  const out: ApiChunk[] = [];
  for (let cursor = start; cursor < end; cursor += maxDays * day) {
    out.push({
      date: new Date(cursor).toISOString().slice(0, 10),
      days: Math.min(maxDays, Math.round((end - cursor) / day)),
    });
  }
  return out;
}

export function apiAreaPath(
  mapKey: string,
  source: string,
  bbox: readonly [number, number, number, number],
  chunk: ApiChunk,
): string {
  return `/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${bbox.join(",")}/${chunk.days}/${chunk.date}`;
}

export type Availability = Map<string, { min: string; max: string }>;

/** Réponse de /api/data_availability : jeu, premier et dernier jour disponibles. */
export function parseAvailability(csv: string): Availability {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((name) => name.trim());
  const id = header.indexOf("data_id");
  const min = header.indexOf("min_date");
  const max = header.indexOf("max_date");
  const out: Availability = new Map();
  if (id < 0 || min < 0 || max < 0) return out;
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells[id] && cells[min] && cells[max]) {
      out.set(cells[id]!, { min: cells[min]!, max: cells[max]! });
    }
  }
  return out;
}

/**
 * Jeu de l'API pour une tranche : le premier (traitement standard d'abord) qui la couvre en
 * entier, sinon le premier qui la couvre en partie ; null si aucun.
 */
export function pickApiSource(
  candidates: readonly string[],
  availability: Availability,
  chunk: ApiChunk,
): string | null {
  const first = chunk.date;
  const last = new Date(Date.parse(`${chunk.date}T00:00:00Z`) + (chunk.days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const known = candidates.filter((name) => availability.has(name));
  const covers = known.find((name) => {
    const range = availability.get(name)!;
    return range.min <= first && range.max >= last;
  });
  if (covers) return covers;
  return (
    known.find((name) => {
      const range = availability.get(name)!;
      return range.min <= last && range.max >= first;
    }) ?? null
  );
}
