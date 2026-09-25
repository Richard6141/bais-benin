import type { IndicatorValues } from "./definition";

// Rendu des messages d'alerte : les gabarits contiennent des marqueurs `{commune}`,
// `{rain_sum_10d}`… remplacés par le contexte ou par les indicateurs, avec les nombres au
// format français (virgule décimale, arrondi à l'unité pour les millimètres et les jours).
// Un marqueur inconnu ou sans valeur est remplacé par un tiret, jamais laissé tel quel.

export interface MessageContext {
  commune: string;
  departement?: string;
  [key: string]: string | number | undefined;
}

const integerFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) >= 10 ? integerFormatter.format(value) : decimalFormatter.format(value);
  }
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(", ") : null;
  return String(value);
}

export function renderMessage(
  template: string,
  indicators: Partial<IndicatorValues>,
  context: MessageContext,
): string {
  return template
    .replace(/\{([a-z0-9_]+)\}/gi, (_match, key: string) => {
      const fromContext = formatValue(context[key]);
      if (fromContext !== null) return fromContext;
      const fromIndicators = formatValue(indicators[key as keyof IndicatorValues]);
      return fromIndicators ?? "—";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Longueur maximale d'un message court (SMS, WhatsApp de notification). */
export const SHORT_MESSAGE_MAX = 160;
