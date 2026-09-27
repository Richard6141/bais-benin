import { logger } from "@/lib/logger";
import type {
  BBox,
  FireDetectionProvider,
  FireFetchResult,
  FireSensorCode,
  RawFireDetection,
} from "@/services/ports/fire-detection-provider";

// Fichiers publics de NASA FIRMS (ADR-0022), sans clé : détections des dernières 24 heures pour
// la région « Afrique du Nord et centrale », qui couvre le Bénin, par capteur. Vérifié le
// 26 septembre 2026 par de vrais appels (HTTP 200, de 0,25 à 1,7 Mo par fichier). Les colonnes
// sont lues par leur nom dans l'en-tête ; seules les lignes dans l'emprise demandée sont gardées.

const FILES: ReadonlyArray<{ sensor: FireSensorCode; path: string }> = [
  {
    sensor: "VIIRS_SNPP",
    path: "/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Northern_and_Central_Africa_24h.csv",
  },
  {
    sensor: "VIIRS_NOAA20",
    path: "/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv",
  },
  {
    sensor: "VIIRS_NOAA21",
    path: "/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Northern_and_Central_Africa_24h.csv",
  },
  {
    sensor: "MODIS",
    path: "/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Northern_and_Central_Africa_24h.csv",
  },
];

const TIMEOUT_MS = 60_000;

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Lecture d'un fichier FIRMS : colonnes par nom, lignes hors emprise ou illisibles écartées. */
export function parseFirmsCsv(csv: string, sensor: FireSensorCode, bbox: BBox): RawFireDetection[] {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((name) => name.trim());
  const column = (name: string) => header.indexOf(name);
  const lat = column("latitude");
  const lon = column("longitude");
  const date = column("acq_date");
  const time = column("acq_time");
  const confidence = column("confidence");
  const frp = column("frp");
  // VIIRS : canal I4 ; MODIS : canal 21/22.
  const brightness = column("bright_ti4") >= 0 ? column("bright_ti4") : column("brightness");
  const daynight = column("daynight");
  // Archives annuelles (ADR-0039) : type 0 pour un feu de végétation présumé ; 1 volcan, 2 autre
  // source fixe (site industriel), 3 en mer sont écartés. Les fichiers récents n'ont pas la colonne.
  const type = column("type");
  if ([lat, lon, date, time, confidence].some((index) => index < 0)) return [];
  const [west, south, east, north] = bbox;

  const out: RawFireDetection[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cells = line.split(",");
    if (type >= 0 && (cells[type] ?? "").trim() !== "0") continue;
    const latitude = toNumber(cells[lat]);
    const longitude = toNumber(cells[lon]);
    if (latitude === null || longitude === null) continue;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    const hhmm = (cells[time] ?? "").trim().padStart(4, "0");
    const acquiredAt = new Date(`${cells[date]}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`);
    if (Number.isNaN(acquiredAt.getTime())) continue;
    const dn = cells[daynight]?.trim();
    out.push({
      sensor,
      latitude,
      longitude,
      acquiredAt,
      confidenceRaw: (cells[confidence] ?? "").trim(),
      frpMw: toNumber(cells[frp]),
      brightnessK: brightness >= 0 ? toNumber(cells[brightness]) : null,
      daynight: dn === "D" || dn === "N" ? dn : null,
    });
  }
  return out;
}

export class FirmsPublicFileProvider implements FireDetectionProvider {
  readonly id = "firms";

  constructor(private readonly baseUrl: string) {}

  async fetchRecent(bbox: BBox): Promise<FireFetchResult> {
    const results = await Promise.all(
      FILES.map(async (file) => {
        try {
          const response = await fetch(`${this.baseUrl}${file.path}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { file, detections: parseFirmsCsv(await response.text(), file.sensor, bbox) };
        } catch (error) {
          logger.warn({ err: error, sensor: file.sensor }, "Fichier FIRMS illisible");
          return { file, detections: null };
        }
      }),
    );
    return {
      detections: results.flatMap((result) => result.detections ?? []),
      failedFiles: results.filter((result) => !result.detections).map((r) => r.file.sensor),
    };
  }
}
