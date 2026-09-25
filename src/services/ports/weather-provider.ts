// Port météo (docs/09 §3). Adaptateurs : Open-Meteo (réseau, sans clé) et fixture
// (séries synthétiques déterministes par zone agro-écologique, pour la démonstration et les tests).
// Le module monitoring ne connaît que ce contrat.

export type WeatherProviderId = "open-meteo" | "fixture";

/** Journée météo pour un lieu. Les valeurs absentes chez le fournisseur restent null. */
export interface WeatherDay {
  /** AAAA-MM-JJ, heure locale du Bénin. */
  date: string;
  kind: "OBSERVED" | "FORECAST";
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  et0Mm: number | null;
  relativeHumidityPct: number | null;
  windKmh: number | null;
}

export interface WeatherLocation {
  /** Clé de l'appelant (code de commune). */
  key: string;
  latitude: number;
  longitude: number;
  /** Zone agro-écologique : utilisée par l'adaptateur fixture pour le profil climatique. */
  zoneCode?: string | null;
}

export interface WeatherRequest {
  locations: readonly WeatherLocation[];
  /** Jour de référence (AAAA-MM-JJ) : les jours antérieurs sont observés, les suivants prévus. */
  today: string;
  /** Nombre de jours passés à inclure (1 à 92). */
  pastDays: number;
  /** Nombre de jours de prévision à inclure, aujourd'hui compris (1 à 16). */
  forecastDays: number;
}

export interface WeatherSeries {
  key: string;
  days: WeatherDay[];
}

export interface WeatherProvenance {
  sourceId: "OPEN_METEO" | "BAIS_SEED";
  /** Fiabilité à enregistrer : estimation de modèle pour Open-Meteo, synthétique pour la fixture. */
  reliability: "ESTIMATED" | "SYNTHETIC";
  licence: string;
}

export interface WeatherProvider {
  readonly id: WeatherProviderId;
  readonly provenance: WeatherProvenance;
  fetchDaily(request: WeatherRequest): Promise<WeatherSeries[]>;
}

export class WeatherProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WeatherProviderError";
  }
}
