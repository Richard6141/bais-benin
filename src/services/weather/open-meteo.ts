import { z } from "zod";
import {
  WeatherProviderError,
  type WeatherDay,
  type WeatherProvider,
  type WeatherRequest,
  type WeatherSeries,
} from "@/services/ports/weather-provider";

// Adaptateur Open-Meteo (https://open-meteo.com, CC BY 4.0, sans clé). Une requête porte
// jusqu'à 50 lieux ; les 77 communes tiennent en deux appels. Les jours passés viennent de
// l'analyse du modèle (« observés » au sens du produit, fiabilité ESTIMATED), les suivants
// des prévisions.

const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "et0_fao_evapotranspiration",
  "relative_humidity_2m_mean",
  "wind_speed_10m_max",
] as const;

const BATCH_SIZE = 50;
const TIMEOUT_MS = 20_000;

const numberOrNull = z.number().nullable();

const locationResponseSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(numberOrNull),
    temperature_2m_min: z.array(numberOrNull),
    precipitation_sum: z.array(numberOrNull),
    et0_fao_evapotranspiration: z.array(numberOrNull),
    relative_humidity_2m_mean: z.array(numberOrNull).optional(),
    wind_speed_10m_max: z.array(numberOrNull),
  }),
});

const responseSchema = z.union([z.array(locationResponseSchema), locationResponseSchema]);

interface OpenMeteoOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

export function buildOpenMeteoUrl(
  baseUrl: string,
  locations: WeatherRequest["locations"],
  request: Pick<WeatherRequest, "pastDays" | "forecastDays">,
): string {
  const params = new URLSearchParams({
    latitude: locations.map((l) => formatCoordinate(l.latitude)).join(","),
    longitude: locations.map((l) => formatCoordinate(l.longitude)).join(","),
    daily: DAILY_VARIABLES.join(","),
    past_days: String(Math.min(Math.max(request.pastDays, 0), 92)),
    forecast_days: String(Math.min(Math.max(request.forecastDays, 1), 16)),
    timezone: "Africa/Porto-Novo",
  });
  return `${baseUrl.replace(/\/$/, "")}/v1/forecast?${params.toString()}`;
}

export function parseOpenMeteoDaily(
  payload: z.infer<typeof locationResponseSchema>,
  today: string,
): WeatherDay[] {
  const daily = payload.daily;
  return daily.time.map((date, index) => ({
    date,
    kind: date < today ? "OBSERVED" : "FORECAST",
    tempMaxC: daily.temperature_2m_max[index] ?? null,
    tempMinC: daily.temperature_2m_min[index] ?? null,
    precipitationMm: daily.precipitation_sum[index] ?? null,
    et0Mm: daily.et0_fao_evapotranspiration[index] ?? null,
    relativeHumidityPct: daily.relative_humidity_2m_mean?.[index] ?? null,
    windKmh: daily.wind_speed_10m_max[index] ?? null,
  }));
}

export function createOpenMeteoProvider(options: OpenMeteoOptions = {}): WeatherProvider {
  const baseUrl = options.baseUrl ?? "https://api.open-meteo.com";
  const fetchImpl = options.fetchImpl ?? fetch;

  async function fetchBatch(
    locations: WeatherRequest["locations"],
    request: WeatherRequest,
  ): Promise<WeatherSeries[]> {
    const url = buildOpenMeteoUrl(baseUrl, locations, request);
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "réseau indisponible";
      throw new WeatherProviderError(`Open-Meteo injoignable : ${reason}`, true);
    }
    if (!response.ok) {
      throw new WeatherProviderError(
        `Open-Meteo a répondu ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new WeatherProviderError("Réponse Open-Meteo inattendue", false);
    }
    const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    if (items.length !== locations.length) {
      throw new WeatherProviderError(
        `Open-Meteo a renvoyé ${items.length} lieux pour ${locations.length} demandés`,
        false,
      );
    }
    return items.map((item, index) => ({
      key: locations[index]!.key,
      days: parseOpenMeteoDaily(item, request.today),
    }));
  }

  return {
    id: "open-meteo",
    provenance: { sourceId: "OPEN_METEO", reliability: "ESTIMATED", licence: "CC BY 4.0" },
    async fetchDaily(request) {
      const series: WeatherSeries[] = [];
      for (let start = 0; start < request.locations.length; start += BATCH_SIZE) {
        const batch = request.locations.slice(start, start + BATCH_SIZE);
        series.push(...(await fetchBatch(batch, request)));
      }
      return series;
    },
  };
}
