import type { GeoPosition } from "@/components/forms/location-picker";

// Données du brouillon d'enregistrement (Dexie `drafts`, kind FARM_ENROLMENT). Chaque section
// correspond à un écran de docs/modules/registre-parcours-ux.md §2.A et reste nulle tant que
// l'écran n'a pas été validé : la reprise reprend au premier écran incomplet.

export const ENROLMENT_STEPS = [
  "Producteur",
  "Position",
  "Taille",
  "Parcelles",
  "Cultures",
  "Consentement",
  "Terminé",
] as const;

export type EnrolmentStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Tenure = "OWNED" | "RENTED" | "FAMILY";
export type Irrigation = "NONE" | "MANUAL" | "DRIP" | "FLOOD";
export type SeasonCode = "MAIN_RAINY" | "SHORT_RAINY" | "DRY" | "ANNUAL";

export interface FarmerSection {
  mode: "EXISTING" | "NEW";
  /** Producteur déjà connu : identifiant et nom repris de la table locale `farms`. */
  existingFarmerId?: string;
  existingFarmerName?: string;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  /** Dix chiffres nationaux (01XXXXXXXX), sans indicatif. */
  phone?: string;
  birthYear?: number;
}

export interface LocationSection {
  position: GeoPosition;
  communeCode: string;
  communeName: string;
  /** Origine affichée à l'agent : déduite de la position ou choisie à la main. */
  communeSource: "GPS" | "MANUAL";
  outsidePerimeter: boolean;
}

export interface SizeSection {
  /** Saisie brute en hectares (« 2,5 »), convertie à la soumission. */
  areaHa: string;
  tenure: Tenure;
  irrigation: Irrigation;
}

export interface ParcelDraft {
  id: string;
  name: string;
  areaHa: number;
  cropCodes: string[];
}

export interface CropsSection {
  cropCodes: string[];
  seasonCode: SeasonCode;
}

export interface EnrolmentResult {
  farmId: string;
  farmCode: string;
  farmerId: string;
}

export interface EnrolmentData {
  farmer: FarmerSection | null;
  location: LocationSection | null;
  size: SizeSection | null;
  parcels: ParcelDraft[];
  crops: CropsSection | null;
  consentAt: string | null;
  result: EnrolmentResult | null;
}

export const EMPTY_ENROLMENT: EnrolmentData = {
  farmer: null,
  location: null,
  size: null,
  parcels: [],
  crops: null,
  consentAt: null,
  result: null,
};

/** Premier écran incomplet, pour reprendre un brouillon là où il s'est arrêté. */
export function firstIncompleteStep(data: EnrolmentData): EnrolmentStep {
  if (data.result) return 6;
  if (!data.farmer) return 0;
  if (!data.location) return 1;
  if (!data.size) return 2;
  if (data.parcels.length === 0 && !data.crops) return 3;
  if (!data.consentAt) return 5;
  return 5;
}
