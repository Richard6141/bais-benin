import {
  NUMERIC_INDICATORS,
  type IndicatorCode,
  type ReportClusterParams,
  type RuleCondition,
  type RuleNode,
} from "./definition";

// Regroupements de signalements dans les règles (ADR-0015) : fonctions pures pour retrouver les
// paramètres des conditions `report_cluster`, les nommer en français et savoir si une règle lit
// la météo (seules celles-là sont bloquées par des données météo anciennes).

const NOT_WEATHER: readonly IndicatorCode[] = [
  "month",
  "report_cluster",
  "fire_near_parcels",
  "fire_count_near_parcels",
];
const WEATHER_INDICATORS = NUMERIC_INDICATORS.filter((code) => !NOT_WEATHER.includes(code));

function conditions(node: RuleNode, out: RuleCondition[] = []): RuleCondition[] {
  if ("all" in node) node.all.forEach((child) => conditions(child, out));
  else if ("any" in node) node.any.forEach((child) => conditions(child, out));
  else if ("not" in node) conditions(node.not, out);
  else out.push(node);
  return out;
}

/** Clé stable d'un jeu de paramètres, pour ne calculer chaque regroupement qu'une fois. */
export function clusterKey(params: ReportClusterParams): string {
  return [params.type, params.radiusKm, params.days, params.confirmedOnly ? "C" : "A"].join("|");
}

/** Jeux de paramètres distincts des conditions de regroupement d'une ou plusieurs règles. */
export function clusterParamsOf(definitions: readonly RuleNode[]): ReportClusterParams[] {
  const found = new Map<string, ReportClusterParams>();
  for (const definition of definitions) {
    for (const condition of conditions(definition)) {
      if (condition.indicator === "report_cluster" && condition.params) {
        found.set(clusterKey(condition.params), condition.params);
      }
    }
  }
  return [...found.values()];
}

export function usesWeather(definition: RuleNode): boolean {
  return conditions(definition).some((c) =>
    (WEATHER_INDICATORS as readonly string[]).includes(c.indicator),
  );
}

export function usesReports(definition: RuleNode): boolean {
  return conditions(definition).some((c) => c.indicator === "report_cluster");
}

/** Vrai si la règle lit les feux actifs (ADR-0022), exploitations exposées ou foyers (ADR-0038). */
export function usesFires(definition: RuleNode): boolean {
  return conditions(definition).some(
    (c) => c.indicator === "fire_near_parcels" || c.indicator === "fire_count_near_parcels",
  );
}

/** Vrai si la règle compte les foyers de feux de la commune (ADR-0038). */
export function usesFireFoyers(definition: RuleNode): boolean {
  return conditions(definition).some((c) => c.indicator === "fire_count_near_parcels");
}

const TYPE_TEXT: Record<ReportClusterParams["type"], string> = {
  PEST: "des ravageurs",
  CROP_DISEASE: "une maladie des cultures",
  ANIMAL_DISEASE: "une maladie animale",
  OTHER: "un autre problème",
};

const kmFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « Producteurs ayant signalé des ravageurs à moins de 5 km en 7 jours ». */
export function clusterLabel(params: ReportClusterParams): string {
  const confirmed = params.confirmedOnly ? " (signalements confirmés)" : "";
  return (
    `Producteurs ayant signalé ${TYPE_TEXT[params.type]} à moins de ` +
    `${kmFormatter.format(params.radiusKm)} km en ${params.days} jours${confirmed}`
  );
}
