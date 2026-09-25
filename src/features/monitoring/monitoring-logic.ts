// Logique de présentation du monitoring, pure et testée : fraîcheur des données, comptes de
// lecture, diffusion par canal, filtres du centre d'alertes. Aucune dépendance à la base.

export type Severity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";
export type Category = "WATER_STRESS" | "FLOOD" | "HEAT" | "PEST" | "MARKET" | "ADMIN";

export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "WATCH", "INFO"];
export const CATEGORIES: readonly Category[] = [
  "WATER_STRESS",
  "FLOOD",
  "HEAT",
  "PEST",
  "MARKET",
  "ADMIN",
];

/** Au-delà de 48 h sans ingestion réussie, les règles ne déclenchent plus (monitoring §2.E). */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export interface IngestionInfo {
  finishedAt: string | null;
  provider: string;
  fallback: boolean;
  status: string;
}

export interface Freshness {
  state: "FRESH" | "STALE" | "FALLBACK" | "NONE";
  ageHours: number | null;
  /** Texte court pour la tuile d'indicateur. */
  label: string;
  /** Texte du bandeau d'avertissement, null quand tout va bien. */
  warning: string | null;
}

export function freshnessOf(ingestion: IngestionInfo | null, now: number = Date.now()): Freshness {
  if (!ingestion?.finishedAt) {
    return {
      state: "NONE",
      ageHours: null,
      label: "Aucune ingestion",
      warning: "Aucune donnée météo ingérée : les alertes ne peuvent pas être calculées.",
    };
  }
  const ageHours = Math.max(0, (now - new Date(ingestion.finishedAt).getTime()) / 3_600_000);
  const age = ageHours < 1 ? "il y a moins d'une heure" : `il y a ${Math.round(ageHours)} h`;
  if (ingestion.fallback) {
    return {
      state: "FALLBACK",
      ageHours,
      label: `Démonstration, ${age}`,
      warning:
        "Données de démonstration : le fournisseur météo était injoignable. Aucune alerte n'est diffusée hors de l'application.",
    };
  }
  if (ageHours * 3_600_000 > STALE_AFTER_MS) {
    return {
      state: "STALE",
      ageHours,
      label: `Anciennes, ${age}`,
      warning:
        "Données météo anciennes (plus de 48 h) : alertes suspendues pour les communes concernées.",
    };
  }
  return { state: "FRESH", ageHours, label: `À jour, ${age}`, warning: null };
}

export function unreadCount(items: readonly { readAt: string | null }[]): number {
  return items.filter((item) => item.readAt === null).length;
}

export const CHANNEL_LABELS: Record<string, string> = {
  IN_APP: "Application",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  RELAY: "Relais agent",
  EMAIL: "E-mail",
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  SENT: "Envoyés",
  DELIVERED: "Remis",
  READ: "Lus",
  FAILED: "Échecs",
  RELAYED: "Relayés",
  SKIPPED: "Non envoyés",
};

/** Ordre de l'entonnoir de diffusion, du moins au plus avancé, échecs à part. */
export const DELIVERY_STATUS_ORDER = [
  "PENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "RELAYED",
  "FAILED",
  "SKIPPED",
];

export interface ChannelSummary {
  channel: string;
  label: string;
  total: number;
  byStatus: { status: string; label: string; count: number }[];
}

export function summarizeDelivery(
  rows: readonly { channel: string; status: string; count: number }[],
): ChannelSummary[] {
  const byChannel = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const statuses = byChannel.get(row.channel) ?? new Map<string, number>();
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + row.count);
    byChannel.set(row.channel, statuses);
  }
  return [...byChannel]
    .map(([channel, statuses]) => ({
      channel,
      label: CHANNEL_LABELS[channel] ?? channel,
      total: [...statuses.values()].reduce((sum, count) => sum + count, 0),
      byStatus: DELIVERY_STATUS_ORDER.filter((status) => statuses.has(status)).map((status) => ({
        status,
        label: DELIVERY_STATUS_LABELS[status] ?? status,
        count: statuses.get(status) ?? 0,
      })),
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CenterFilters {
  severity?: Severity;
  category?: Category;
  departementCode?: string;
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Lecture tolérante des paramètres d'adresse : une valeur inconnue est ignorée, jamais une erreur. */
export function parseCenterFilters(
  params: Record<string, string | string[] | undefined>,
): CenterFilters {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const severity = first("severite");
  const category = first("categorie");
  const departement = first("departement");
  return {
    severity: isSeverity(severity) ? severity : undefined,
    category: isCategory(category) ? category : undefined,
    departementCode: departement && /^BJ-[A-Z]{2}$/.test(departement) ? departement : undefined,
  };
}

/** Filtre par département à partir de la table commune → département. */
export function filterByDepartement<T extends { communeCode: string }>(
  items: readonly T[],
  departementCode: string | undefined,
  departementOf: ReadonlyMap<string, string>,
): T[] {
  if (!departementCode) return [...items];
  return items.filter((item) => departementOf.get(item.communeCode) === departementCode);
}

export const percentFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

// --- Exploitations concernées par une alerte (fiche agent, B2) ---

export interface AffectedFarmLike {
  village: string | null;
  hasPhone: boolean;
  read: boolean;
  relay: unknown;
  attention: "NO_PHONE" | "TO_CALL" | "DELIVERY_FAILED" | "NOT_SENT" | "UNREAD" | null;
}

export interface AffectedSummary {
  total: number;
  /** Sans téléphone, ou aucun canal abouti et aucun relais prévu : à prévenir de vive voix. */
  toTellInPerson: number;
  deliveryFailed: number;
  /** Message non envoyé (canal écarté), relais par l'agent prévu. Jamais compté en échec. */
  notSent: number;
  unread: number;
  relayed: number;
  read: number;
}

export function summarizeAffected(farms: readonly AffectedFarmLike[]): AffectedSummary {
  return {
    total: farms.length,
    toTellInPerson: farms.filter((f) => f.attention === "NO_PHONE" || f.attention === "TO_CALL")
      .length,
    deliveryFailed: farms.filter((f) => f.attention === "DELIVERY_FAILED").length,
    notSent: farms.filter((f) => f.attention === "NOT_SENT").length,
    unread: farms.filter((f) => f.attention === "UNREAD").length,
    relayed: farms.filter((f) => f.relay !== null && f.relay !== undefined).length,
    read: farms.filter((f) => f.read).length,
  };
}

export const AFFECTED_PAGE_SIZE = 20;

/** Villages présents, triés, avec le nombre d'exploitations ; « sans village » à la fin. */
export function villagesOf(farms: readonly AffectedFarmLike[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const farm of farms) {
    if (!farm.village) continue;
    counts.set(farm.village, (counts.get(farm.village) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Filtre par village puis garde les `page × 20` premières lignes : « Afficher la suite » ajoute une
 * page sans perdre la position, et l'ordre du service (urgences d'abord) est conservé.
 */
export function pageAffected<T extends AffectedFarmLike>(
  farms: readonly T[],
  options: { page?: number; village?: string },
): { items: T[]; shown: number; matching: number; hasMore: boolean; page: number } {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const matching = options.village
    ? farms.filter((f) => f.village === options.village)
    : [...farms];
  const items = matching.slice(0, page * AFFECTED_PAGE_SIZE);
  return {
    items,
    shown: items.length,
    matching: matching.length,
    hasMore: items.length < matching.length,
    page,
  };
}
