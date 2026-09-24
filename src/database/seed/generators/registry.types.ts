/**
 * Contrats d'entrée et de sortie du générateur de registre synthétique.
 *
 * L'entrée est volontairement indépendante de Prisma et des référentiels : le générateur reçoit des
 * structures plates que l'appelant construit depuis la base ou depuis les constantes de
 * `src/database/seed/reference`. La sortie est directement insérable, chaque ligne portant sa
 * provenance (`SYNTHETIC` / `BAIS_SEED`, docs/08 §1).
 */

import type { MultiPolygon, Polygon, Position } from "./geometry";
import type { Gender, LinguisticArea } from "./names";

export interface CommuneInput {
  code: string;
  name: string;
  departementCode: string;
  /** Libellé du département, source du fragment DEP3 des codes d'exploitation. */
  departementName: string;
  zoneCode: string;
  /** Poids relatif (population rurale × intensité agricole de la zone, docs/08 §6.3). */
  ruralPopulationWeight: number;
  polygon: Polygon | MultiPolygon;
}

export interface CropInput {
  code: string;
  mainZoneCodes: readonly string[];
  cycle: "ANNUAL" | "PERENNIAL" | "GATHERED";
  calendar: {
    south?: { harvest: readonly [number, number] };
    north?: { harvest: readonly [number, number] };
  };
}

export interface CampaignInput {
  code: string;
  startYear: number;
}

export interface RegistryInput {
  communes: readonly CommuneInput[];
  crops: readonly CropInput[];
  campaigns: readonly CampaignInput[];
}

export interface RegistryOptions {
  seed: number;
  farmCount: number;
}

export type VerificationStatus = "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED";
export type SeasonCode = "MAIN_RAINY" | "SHORT_RAINY" | "DRY" | "ANNUAL";

interface Provenance {
  reliability: "SYNTHETIC";
  sourceId: "BAIS_SEED";
}

export interface SyntheticFarmer extends Provenance {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthYear: number;
  householdSize: number;
  phone: string;
  communeCode: string;
  linguisticArea: LinguisticArea;
}

export interface SyntheticFarm extends Provenance {
  id: string;
  code: string;
  farmerId: string;
  communeCode: string;
  departementCode: string;
  zoneCode: string;
  location: Position;
  totalAreaHa: number;
  parcelCount: number;
  verificationStatus: VerificationStatus;
}

export interface SyntheticParcel extends Provenance {
  id: string;
  code: string;
  farmId: string;
  communeCode: string;
  geometry: Polygon;
  centroid: Position;
  /** Superficie annoncée par le producteur. */
  declaredAreaHa: number;
  /** Superficie calculée depuis la géométrie ; l'écart avec le déclaré est voulu (docs/08 §6.4). */
  computedAreaHa: number;
}

export interface SyntheticParcelCrop extends Provenance {
  id: string;
  parcelId: string;
  campaignCode: string;
  cropCode: string;
  seasonCode: SeasonCode;
  areaHa: number;
}

export interface SyntheticRegistry {
  farmers: SyntheticFarmer[];
  farms: SyntheticFarm[];
  parcels: SyntheticParcel[];
  parcelCrops: SyntheticParcelCrop[];
}
