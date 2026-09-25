// Logique pure du parcours « Déclarer ma récolte » (docs/modules/registre-parcours-ux.md §2.C) :
// ordre des écrans, saut de l'écran de choix quand il n'y a qu'une culture, niveaux de pertes,
// phrase de résumé. Aucun accès réseau ni composant : testable sans navigateur.

import { unitLabel } from "./format";

export type WizardStep = "CROP" | "QUANTITY" | "LOSSES" | "DONE";

export const WIZARD_STEP_LABELS: Record<Exclude<WizardStep, "DONE">, string> = {
  CROP: "Quelle culture ?",
  QUANTITY: "Combien ?",
  LOSSES: "Pertes",
};

export interface WizardSeason {
  parcelCropId: string;
  parcelCode: string;
  cropCode: string;
  cropName: string;
  campaignCode: string;
  tradeUnit: string;
  /** Date ISO du mois de récolte attendu, ou null. */
  expectedHarvestOn: string | null;
}

/** Premier écran : le choix est sauté quand une seule culture est déclarée. */
export function initialStep(seasons: readonly WizardSeason[]): WizardStep {
  return seasons.length === 1 ? "QUANTITY" : "CROP";
}

/** Culture présélectionnée quand l'écran est sauté. */
export function initialSeason(seasons: readonly WizardSeason[]): WizardSeason | null {
  return seasons.length === 1 ? (seasons[0] ?? null) : null;
}

/** Ordre visible dans l'indicateur d'étapes : sans écran de choix, il ne reste que deux étapes. */
export function visibleSteps(seasons: readonly WizardSeason[]): Exclude<WizardStep, "DONE">[] {
  return seasons.length === 1 ? ["QUANTITY", "LOSSES"] : ["CROP", "QUANTITY", "LOSSES"];
}

export function nextStep(step: WizardStep): WizardStep {
  switch (step) {
    case "CROP":
      return "QUANTITY";
    case "QUANTITY":
      return "LOSSES";
    case "LOSSES":
    case "DONE":
      return "DONE";
  }
}

export function previousStep(step: WizardStep, seasons: readonly WizardSeason[]): WizardStep {
  switch (step) {
    case "QUANTITY":
      return seasons.length === 1 ? "QUANTITY" : "CROP";
    case "LOSSES":
      return "QUANTITY";
    case "CROP":
    case "DONE":
      return step;
  }
}

/** Trois réponses possibles, traduites en pourcentage indicatif (docs/08 : estimation). */
export const LOSS_LEVELS = [
  { code: "NONE", label: "Aucune", lossesPct: 0 },
  { code: "SOME", label: "Un peu", lossesPct: 10 },
  { code: "MUCH", label: "Beaucoup", lossesPct: 40 },
] as const;
export type LossLevel = (typeof LOSS_LEVELS)[number]["code"];

export const LOSS_CAUSES = [
  { code: "DROUGHT", label: "Sécheresse" },
  { code: "FLOOD", label: "Inondation" },
  { code: "PESTS", label: "Ravageurs" },
  { code: "STORAGE", label: "Stockage" },
  { code: "OTHER", label: "Autre" },
] as const;
export type LossCause = (typeof LOSS_CAUSES)[number]["code"];

export function lossesPctFor(level: LossLevel | null | undefined): number | undefined {
  if (!level) return undefined;
  return LOSS_LEVELS.find((l) => l.code === level)?.lossesPct;
}

export { unitLabel } from "./format";

const amountFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export interface SummaryInput {
  cropName: string;
  amount: number;
  unitLabelSingular: string;
  parcelCode?: string | null;
  campaignCode: string;
  /** Nombre de parcelles de l'exploitation : la parcelle n'est citée que s'il y en a plusieurs. */
  parcelCount?: number;
}

/** « Maïs, 8 sacs de 100 kg, parcelle P01, campagne 2026-2027. » */
export function buildSummary(input: SummaryInput): string {
  const parts = [
    input.cropName,
    `${amountFormatter.format(input.amount)} ${unitLabel(input.unitLabelSingular, input.amount)}`,
  ];
  if (input.parcelCode && (input.parcelCount ?? 2) > 1) {
    const short = input.parcelCode.split("-").pop() ?? input.parcelCode;
    parts.push(`parcelle ${short}`);
  }
  parts.push(`campagne ${input.campaignCode}`);
  return `${parts.join(", ")}.`;
}

/** Nombre entier ou décimal saisi avec virgule ou point ; NaN si vide ou illisible. */
export function parseQuantity(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return Number.NaN;
  return Number(normalized);
}
