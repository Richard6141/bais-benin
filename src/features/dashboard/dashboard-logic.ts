// Logique de présentation du tableau de bord national (étape 7), pure et testée : filtres lus
// dans l'adresse, cellules masquées par le secret statistique, formats, variations entre
// campagnes, tri des tableaux. Aucune dépendance à la base : les services d'analytique rendent
// des nombres, ce module décide de leur lecture.

import {
  K_ANONYMITY,
  MASKED_VALUE_EXPLANATION,
  MASKED_VALUE_LABEL,
} from "@/components/data-display/masked-labels";
import type { SortValue } from "@/lib/sort";

export { K_ANONYMITY };
export const MASKED_LABEL = MASKED_VALUE_LABEL;
export const MASKED_EXPLANATION = MASKED_VALUE_EXPLANATION;

/** Valeur d'agrégat : un nombre, masqué par le secret statistique, ou absent (pas de donnée). */
export type Masked = { masked: true };
export type Cell = number | Masked | null;

/** Cellule d'une ligne d'agrégat : les services masquent la ligne entière (`masked`) et rendent
 *  `null` pour une donnée absente. */
export function cellOf(value: number | null | undefined, masked: boolean): Cell {
  if (masked) return { masked: true };
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isMasked(cell: Cell | undefined): cell is Masked {
  return typeof cell === "object" && cell !== null && cell.masked === true;
}

/** Nombre utilisable pour un calcul ou un tri : jamais une valeur masquée ou absente. */
export function numeric(cell: Cell | undefined): number | null {
  return typeof cell === "number" && Number.isFinite(cell) ? cell : null;
}

// --- Filtres de l'adresse : mêmes clés que la carte agricole (étape 4), pour qu'une vue filtrée
// du tableau de bord et de la carte se partagent par le même lien.

export const VERIFICATION_STATUSES = [
  "DECLARED",
  "AGENT_VERIFIED",
  "FIELD_VERIFIED",
  "DISPUTED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  DECLARED: "Déclarées",
  AGENT_VERIFIED: "Vérifiées par l'agent",
  FIELD_VERIFIED: "Vérifiées sur le terrain",
  DISPUTED: "Contestées",
};

export interface DashboardFilters {
  campaignCode?: string;
  cropCode?: string;
  departementCode?: string;
  verificationStatus?: VerificationStatus;
}

export const FILTER_KEYS = [
  "campaignCode",
  "cropCode",
  "departementCode",
  "verificationStatus",
] as const;

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | undefined {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/** Lecture tolérante : une valeur mal formée est ignorée, jamais une erreur (mêmes formats que l'API). */
export function parseDashboardFilters(params: Params): DashboardFilters {
  const campaign = first(params, "campaignCode");
  const crop = first(params, "cropCode");
  const departement = first(params, "departementCode");
  const status = first(params, "verificationStatus");
  return {
    campaignCode: campaign && /^\d{4}-\d{4}$/.test(campaign) ? campaign : undefined,
    cropCode: crop && /^[A-Z][A-Z0-9_]{1,31}$/.test(crop) ? crop : undefined,
    departementCode: departement && /^BJ-[A-Z]{2}$/.test(departement) ? departement : undefined,
    verificationStatus: (VERIFICATION_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as VerificationStatus)
      : undefined,
  };
}

/** Chaîne de requête des filtres (sans « ? »), avec des modifications ponctuelles. */
export function filtersQuery(
  filters: DashboardFilters,
  patch: Partial<Record<keyof DashboardFilters, string | undefined>> = {},
): string {
  const merged: Record<string, string | undefined> = { ...filters, ...patch };
  const search = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = merged[key];
    if (value) search.set(key, value);
  }
  return search.toString();
}

export function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

export interface CampaignLike {
  code: string;
  startYear: number;
  status: "PLANNED" | "OPEN" | "CLOSED";
}

/** Campagne par défaut : l'ouverte la plus récente, sinon la dernière close, sinon aucune. */
export function defaultCampaign(campaigns: readonly CampaignLike[]): string | undefined {
  const byYear = [...campaigns].sort((a, b) => b.startYear - a.startYear);
  return (
    byYear.find((c) => c.status === "OPEN")?.code ?? byYear.find((c) => c.status === "CLOSED")?.code
  );
}

/** Campagne précédente de celle affichée, pour dire contre quoi une tendance compare. */
export function previousCampaign(
  campaigns: readonly CampaignLike[],
  code: string | undefined,
): string | undefined {
  const current = campaigns.find((c) => c.code === code);
  if (!current) return undefined;
  return [...campaigns]
    .filter((c) => c.startYear < current.startYear && c.status !== "PLANNED")
    .sort((a, b) => b.startYear - a.startYear)[0]?.code;
}

// --- Formats (français, espaces fines insécables fournies par Intl).

const integerFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

export const formatInteger = (value: number) => integerFormat.format(value);
export const formatDecimal = (value: number) => decimalFormat.format(value);
export const formatShare = (value: number) => percentFormat.format(value);
/** Hectares : entiers au-delà de 100 ha, une décimale en dessous (une commune, une culture rare). */
export const formatHectares = (value: number) =>
  `${value >= 100 ? integerFormat.format(value) : decimalFormat.format(value)} ha`;
/** Production saisie en kilogrammes, lue en tonnes. */
export const formatTonnesFromKg = (kg: number) =>
  `${kg >= 100_000 ? integerFormat.format(kg / 1000) : decimalFormat.format(kg / 1000)} t`;

/** Texte d'une cellule : « moins de 5 », tiret pour une absence, sinon la valeur formatée. */
export function displayCell(cell: Cell | undefined, format: (value: number) => string): string {
  if (isMasked(cell)) return MASKED_LABEL;
  const value = numeric(cell);
  return value === null ? "—" : format(value);
}

/** Variation relative en %, ou null si l'une des deux campagnes n'a pas de donnée comparable. */
export function variationPercent(current: Cell, previous: Cell): number | null {
  const now = numeric(current);
  const before = numeric(previous);
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / before) * 100;
}

/** « 1,4 fois la moyenne départementale », « 0,6 fois … » ; null si la référence est nulle. */
export function ratioPhrase(value: Cell, reference: Cell, of: string): string | null {
  const v = numeric(value);
  const r = numeric(reference);
  if (v === null || r === null || r === 0) return null;
  return `${decimalFormat.format(v / r)} fois ${of}`;
}

/** Écart du rendement indicatif au rendement de référence de la culture, en %. */
export function yieldGapPercent(yieldTPerHa: Cell, referenceTPerHa: number | null): number | null {
  return referenceTPerHa ? variationPercent(yieldTPerHa, referenceTPerHa) : null;
}

export function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${decimalFormat.format(value)} %`;
}

// --- Tri des tableaux.

// Tri partagé avec le tableau triable (src/lib/sort.ts) : même ordre à l'écran et dans les tests.
export { compareSortValues, sortRows, type SortDirection, type SortValue } from "@/lib/sort";
/** Valeur de tri d'une cellule d'agrégat : une valeur masquée ne se classe pas. */
export const sortValueOf = (cell: Cell | undefined): SortValue => numeric(cell);

// --- Résumé des filtres, pour l'en-tête de la fiche imprimable et le nom des exports.

export function describeFilters(
  filters: DashboardFilters,
  names: { crops: ReadonlyMap<string, string>; departements: ReadonlyMap<string, string> },
): string {
  const parts = [
    filters.campaignCode ? `Campagne ${filters.campaignCode}` : "Toutes les campagnes",
    filters.cropCode ? (names.crops.get(filters.cropCode) ?? filters.cropCode) : "Toutes cultures",
    filters.departementCode
      ? (names.departements.get(filters.departementCode) ?? filters.departementCode)
      : "Tout le pays",
  ];
  if (filters.verificationStatus) parts.push(VERIFICATION_LABELS[filters.verificationStatus]);
  return parts.join(", ");
}
