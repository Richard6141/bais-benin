import { describe, expect, it, vi } from "vitest";
import { createFixtureWeatherProvider } from "../fixture-provider";
import { buildOpenMeteoUrl, createOpenMeteoProvider } from "../open-meteo";

const DJOUGOU = { key: "BJ-DON-003", latitude: 9.7085, longitude: 1.666, zoneCode: "ZAE_4" };
const COTONOU = { key: "BJ-LIT-001", latitude: 6.3654, longitude: 2.4183, zoneCode: "ZAE_8" };

function dailyPayload(times: string[], rain: Array<number | null>) {
  return {
    daily: {
      time: times,
      temperature_2m_max: times.map(() => 31.2),
      temperature_2m_min: times.map(() => 22.4),
      precipitation_sum: rain,
      et0_fao_evapotranspiration: times.map(() => 4.1),
      relative_humidity_2m_mean: times.map(() => 78),
      wind_speed_10m_max: times.map(() => 12.5),
    },
  };
}

describe("adaptateur Open-Meteo", () => {
  it("construit une requête groupée bornée aux limites du service", () => {
    const url = new URL(
      buildOpenMeteoUrl("https://api.open-meteo.com/", [DJOUGOU, COTONOU], {
        pastDays: 200,
        forecastDays: 30,
      }),
    );
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("9.7085,6.3654");
    expect(url.searchParams.get("longitude")).toBe("1.6660,2.4183");
    expect(url.searchParams.get("past_days")).toBe("92");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("Africa/Porto-Novo");
  });

  it("sépare jours observés et prévus autour du jour de référence et garde les valeurs absentes", async () => {
    const times = ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
    const fetchImpl = vi.fn(async () =>
      Response.json([dailyPayload(times, [6, null, 2.9, 10]), dailyPayload(times, [0, 0, 0, 0])]),
    );
    const provider = createOpenMeteoProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const [djougou, cotonou] = await provider.fetchDaily({
      locations: [DJOUGOU, COTONOU],
      today: "2026-09-25",
      pastDays: 2,
      forecastDays: 2,
    });
    expect(djougou?.key).toBe("BJ-DON-003");
    expect(cotonou?.key).toBe("BJ-LIT-001");
    expect(djougou?.days.map((d) => d.kind)).toEqual([
      "OBSERVED",
      "OBSERVED",
      "FORECAST",
      "FORECAST",
    ]);
    expect(djougou?.days[1]?.precipitationMm).toBeNull();
    expect(djougou?.days[0]).toMatchObject({ tempMaxC: 31.2, et0Mm: 4.1, relativeHumidityPct: 78 });
  });

  it("signale une erreur réessayable quand le service est surchargé", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 }));
    const provider = createOpenMeteoProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      provider.fetchDaily({
        locations: [DJOUGOU],
        today: "2026-09-25",
        pastDays: 1,
        forecastDays: 1,
      }),
    ).rejects.toMatchObject({ name: "WeatherProviderError", retryable: true });
  });
});

describe("adaptateur fixture", () => {
  it("produit une série déterministe couvrant passé et prévision", async () => {
    const provider = createFixtureWeatherProvider({ seed: 7 });
    const request = { locations: [DJOUGOU], today: "2026-09-25", pastDays: 10, forecastDays: 3 };
    const [first] = await provider.fetchDaily(request);
    const [second] = await provider.fetchDaily(request);
    expect(first?.days).toHaveLength(13);
    expect(first?.days.filter((d) => d.kind === "FORECAST")).toHaveLength(3);
    expect(first?.days[0]?.date).toBe("2026-09-15");
    expect(first).toEqual(second);
    expect(provider.provenance.reliability).toBe("SYNTHETIC");
  });
});
