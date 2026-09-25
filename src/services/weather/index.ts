import type { WeatherProvider, WeatherProviderId } from "@/services/ports/weather-provider";
import { createFixtureWeatherProvider } from "./fixture-provider";
import { createOpenMeteoProvider } from "./open-meteo";

export { createFixtureWeatherProvider } from "./fixture-provider";
export { buildOpenMeteoUrl, createOpenMeteoProvider, parseOpenMeteoDaily } from "./open-meteo";

interface WeatherProviderConfig {
  provider: WeatherProviderId;
  openMeteoBaseUrl?: string;
}

// Fournisseur principal choisi par configuration ; la fixture sert toujours de repli.
export function createWeatherProviders(config: WeatherProviderConfig): {
  primary: WeatherProvider;
  fallback: WeatherProvider;
} {
  const fallback = createFixtureWeatherProvider();
  const primary =
    config.provider === "fixture"
      ? fallback
      : createOpenMeteoProvider({ baseUrl: config.openMeteoBaseUrl });
  return { primary, fallback };
}
