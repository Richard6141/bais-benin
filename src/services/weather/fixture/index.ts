// Fixtures météo : profils climatiques par zone agro-écologique, séries journalières
// déterministes et scénarios d'épisodes pour les tests du moteur de règles.
// Module pur : aucun accès réseau, aucune dépendance à la base de données.

export {
  CLIMATE_PROFILES,
  ZONE_CODES,
  getClimateProfile,
  type ClimateProfile,
  type MonthlyClimate,
  type RainfallRegime,
  type ZoneCode,
} from "./climate-profiles";
export { applyDrySpell, applyFloodEpisode, applyHeatWave } from "./scenarios";
export {
  formatIsoDate,
  generateDailyWeather,
  monthlyPrecipitation,
  parseIsoDate,
  totalPrecipitation,
  type DailyWeather,
  type GenerateDailyWeatherOptions,
  type WeatherKind,
} from "./synthetic-weather";
