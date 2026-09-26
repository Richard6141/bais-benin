import { cropGroupOf, type CropGroup } from "./crop-groups";

// Règles des cultures par parcelle (ADR-0030), sans base ni réseau : étiquette d'entraînement,
// priorité de visite (apprentissage actif) et raison lisible donnée à l'agent.

/** Sous cette confiance, la culture mesurée est dite incertaine. */
export const UNCERTAIN_BELOW = 0.6;
/** Une parcelle visitée sur le terrain compte deux fois plus qu'une vérifiée au bureau. */
export const FIELD_VISIT_WEIGHT = 2;

/**
 * Étiquette d'une parcelle pour l'entraînement, de la plus sûre à la moins sûre :
 * 1. la culture constatée sur place par un agent (poids double) ;
 * 2. la culture déclarée, confirmée par une visite de terrain de la parcelle (poids double) ;
 * 3. la culture déclarée d'une exploitation vérifiée (poids simple).
 * Une visite qui rejette la parcelle l'écarte.
 */
export function trainingLabel(signature: {
  crop_code: string | null;
  verified: boolean;
  visit_outcome: "CONFIRMED" | "CORRECTED" | "REJECTED" | null;
  observed_crop_code?: string | null;
}): { group: CropGroup; weight: number; source: "observed" | "visit" | "desk" } | null {
  const observed = signature.observed_crop_code ? cropGroupOf(signature.observed_crop_code) : null;
  if (observed) return { group: observed, weight: FIELD_VISIT_WEIGHT, source: "observed" };
  const group = signature.crop_code ? cropGroupOf(signature.crop_code) : null;
  if (!group || signature.visit_outcome === "REJECTED") return null;
  if (signature.visit_outcome) return { group, weight: FIELD_VISIT_WEIGHT, source: "visit" };
  return signature.verified ? { group, weight: 1, source: "desk" } : null;
}

/**
 * Priorité d'une parcelle dans la file de l'agent (apprentissage actif) : d'abord les parcelles
 * que le satellite voit autrement que déclarées, les plus sûres d'abord (déclaration
 * probablement fausse) ; puis les incertaines, les moins sûres d'abord (là où une visite apprend
 * le plus au modèle). Null pour une parcelle en accord.
 */
export function visitPriority(
  agreement: "AGREES" | "DIFFERS" | "UNCERTAIN",
  confidence: number,
): number | null {
  if (agreement === "DIFFERS") return 1 + confidence;
  if (agreement === "UNCERTAIN") return 1 - confidence;
  return null;
}

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/**
 * Raison lisible de la visite demandée à l'agent, par exemple « Satellite : coton, déclaré : maïs,
 * confiance 72 % ». Libellés courts, sans point-virgule ni points de suspension.
 */
export function cropDoubtReason(doubt: {
  agreement: "DIFFERS" | "UNCERTAIN";
  measuredLabel: string;
  declaredLabel: string | null;
  confidence: number;
}): string {
  const measured = doubt.measuredLabel.toLowerCase();
  const confidence = percent.format(doubt.confidence);
  if (doubt.agreement === "UNCERTAIN") {
    return `Satellite incertain : ${measured} peut-être, confiance ${confidence}`;
  }
  const declared = doubt.declaredLabel ? doubt.declaredLabel.toLowerCase() : "aucune culture";
  return `Satellite : ${measured}, déclaré : ${declared}, confiance ${confidence}`;
}
