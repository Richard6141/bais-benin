import { prisma } from "@/database/client";
import { readWeatherSeries } from "@/database/sql/weather.sql";
import { addDays, beninToday, isoDate } from "./dates";

// Météo d'une commune pour l'affichage (bande 7 jours, cumul de pluie sur 30 jours).
// Données publiques et agrégées : aucune restriction de périmètre.

export interface CommuneWeatherDay {
  date: string;
  tMaxC: number | null;
  tMinC: number | null;
  rainMm: number | null;
  forecast: boolean;
}

export interface CommuneWeather {
  communeCode: string;
  communeName: string;
  referenceDate: string;
  /** 3 derniers jours observés et 7 jours de prévision. */
  strip: CommuneWeatherDay[];
  /** 30 jours observés et 3 jours prévus, pour le graphique de pluie. */
  rain: CommuneWeatherDay[];
  rain10dMm: number | null;
  source: string;
  reliability: string;
  fetchedAt: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  OPEN_METEO: "Open-Meteo",
  BAIS_SEED: "Données de démonstration",
};

export async function getCommuneWeather(
  communeCode: string,
  referenceDate: string = beninToday(),
): Promise<CommuneWeather | null> {
  const commune = await prisma.commune.findFirst({
    where: { code: communeCode, archivedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!commune) return null;
  // La journée en cours n'est pas encore observée : les prévisions démarrent aujourd'hui.
  const lastObserved = addDays(referenceDate, -1);
  // Les prévisions du jour sont émises le jour même : on les accepte jusqu'à la date de référence.
  const rows = await readWeatherSeries([commune.id], lastObserved, 30, 8, referenceDate);
  const days: CommuneWeatherDay[] = rows.map((row) => ({
    date: isoDate(row.observed_on),
    tMaxC: row.temp_max_c,
    tMinC: row.temp_min_c,
    rainMm: row.precipitation_mm,
    forecast: row.kind === "FORECAST",
  }));
  const observed = days.filter((d) => !d.forecast);
  const forecast = days.filter((d) => d.forecast);
  const last10 = observed.slice(-10);
  const rain10 =
    last10.length >= 8 && last10.every((d) => d.rainMm !== null)
      ? last10.reduce((sum, d) => sum + (d.rainMm ?? 0), 0)
      : null;
  const synthetic = rows.some((r) => r.reliability === "SYNTHETIC");
  const sourceId = rows.find((r) => r.kind === "OBSERVED")?.source_id ?? rows[0]?.source_id;
  const fetchedAt = rows.reduce<Date | null>(
    (max, r) => (max === null || r.fetched_at > max ? r.fetched_at : max),
    null,
  );
  return {
    communeCode: commune.code,
    communeName: commune.name,
    referenceDate,
    strip: [...observed.slice(-3), ...forecast.slice(0, 7)],
    rain: [...observed.slice(-30), ...forecast.slice(0, 3)],
    rain10dMm: rain10 === null ? null : Math.round(rain10 * 10) / 10,
    source: sourceId ? (SOURCE_LABELS[sourceId] ?? sourceId) : "Aucune donnée",
    reliability: synthetic ? "SYNTHETIC" : "ESTIMATED",
    fetchedAt: fetchedAt?.toISOString() ?? null,
  };
}
