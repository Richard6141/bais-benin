import { getNationalStats } from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { getMonitoringOverview } from "@/modules/monitoring";

// Indicateurs que l'assistant du ministère peut afficher (assistant-parcours-ux §2.C). Le modèle
// choisit seulement un nom dans cette liste fermée et des filtres ; les chiffres viennent des
// modules analytics et monitoring, tels quels, avec leur source. Le modèle n'écrit aucun chiffre.
// Production par culture, classement et qualité seront branchés sur les services du tableau de
// bord national (étape 7) ; d'ici là ils répondent « pas encore disponible ».

export const MINISTRY_INDICATORS = [
  "overview",
  "active_alerts",
  "crop_production",
  "territory_ranking",
  "data_quality",
] as const;
export type MinistryIndicator = (typeof MINISTRY_INDICATORS)[number];

export interface IndicatorFigure {
  label: string;
  /** Null quand l'effectif est masqué (moins de 5 exploitations). */
  value: number | null;
  unit: string | null;
}

export interface IndicatorBlock {
  indicator: MinistryIndicator;
  title: string;
  available: boolean;
  figures: IndicatorFigure[];
  source: string;
  generatedAt: string;
  /** Lien vers l'écran du tableau de bord qui détaille l'indicateur. */
  href: string;
}

const CROP_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;

export function isMinistryIndicator(value: string): value is MinistryIndicator {
  return (MINISTRY_INDICATORS as readonly string[]).includes(value);
}

export async function readIndicator(
  actor: Actor,
  indicator: MinistryIndicator,
  filters: Record<string, string>,
  now = new Date(),
): Promise<IndicatorBlock> {
  const cropCode =
    filters.cropCode && CROP_CODE.test(filters.cropCode) ? filters.cropCode : undefined;
  if (indicator === "overview") {
    // Le service masque lui-même les effectifs de moins de 5 exploitations (valeurs nulles).
    const stats = await getNationalStats({ cropCode }, now);
    return {
      indicator,
      title: cropCode ? `Registre national, culture ${cropCode}` : "Registre national",
      available: true,
      figures: [
        { label: "Exploitations", value: stats.farmCount, unit: null },
        { label: "Producteurs", value: stats.farmerCount, unit: null },
        { label: "Superficie déclarée", value: stats.declaredAreaHa, unit: "ha" },
        {
          label: "Part vérifiée",
          value: stats.verifiedShare === null ? null : Math.round(stats.verifiedShare * 1000) / 10,
          unit: "%",
        },
      ],
      source: stats.provenance.source,
      generatedAt: stats.provenance.generatedAt.toISOString(),
      href: "/pilotage",
    };
  }
  if (indicator === "active_alerts") {
    const overview = await getMonitoringOverview(actor);
    const bySeverity = overview.activeBySeverity;
    return {
      indicator,
      title: "Alertes agro-climatiques en cours",
      available: true,
      figures: [
        {
          label: "Alertes actives",
          value: bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.WATCH + bySeverity.INFO,
          unit: null,
        },
        { label: "Communes en alerte", value: overview.communesInAlert, unit: null },
        { label: "Exploitations touchées", value: overview.affectedFarms, unit: null },
      ],
      source: "Alertes agro-climatiques BAIS",
      generatedAt: now.toISOString(),
      href: "/pilotage/alertes",
    };
  }
  return {
    indicator,
    title: "Indicateur pas encore disponible dans l'assistant",
    available: false,
    figures: [],
    source: "registre BAIS",
    generatedAt: now.toISOString(),
    href: "/pilotage",
  };
}
