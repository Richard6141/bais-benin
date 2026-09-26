import {
  readConditionIsDemo,
  readCropCondition,
  type CropConditionRow,
} from "@/database/sql/crop-condition.sql";
import { readCampaigns } from "@/database/sql/dashboard.sql";
import type { Actor } from "@/modules/authorization";
import { resolveCampaign, toCampaignRef } from "./aggregate";
import type { CampaignRef } from "./dashboard-types";
import { K_ANONYMITY } from "./k-anonymity";
import { analyticsScope, requireNational } from "./scope";

// État des cultures vu du satellite, sur le modèle du « Crop Condition » hebdomadaire de l'USDA,
// mais mesuré et non estimé par des observateurs : chaque parcelle contrôlée est classée bonne,
// moyenne ou faible selon son NDVI maximal face aux parcelles de la même culture et de la même
// zone agro-écologique ; les parcelles « à vérifier » (végétation sans rapport avec la culture
// déclarée) sont comptées à part. Les parts sont calculées sur la surface semée observée.
// Ministère seulement, comme les autres comparaisons nommées entre territoires.

export type ConditionClass = "GOOD" | "FAIR" | "POOR" | "TO_VERIFY" | "UNOBSERVED";

export const CONDITION_CLASSES: readonly ConditionClass[] = [
  "GOOD",
  "FAIR",
  "POOR",
  "TO_VERIFY",
  "UNOBSERVED",
];

export interface ConditionBreakdown {
  parcels: number;
  areaHa: number;
  byClass: Record<ConditionClass, { parcels: number; areaHa: number }>;
  /** Parts de la surface observée (hors « non observée »), de 0 à 1 ; null sans surface observée. */
  goodShare: number | null;
  poorShare: number | null;
  toVerifyShare: number | null;
}

export interface CropConditionDepartement {
  code: string;
  name: string;
  /** Moins de K_ANONYMITY parcelles : les parts ne sont pas publiées. */
  masked: boolean;
  breakdown: ConditionBreakdown | null;
}

export interface CropConditionCrop {
  code: string;
  name: string;
  national: ConditionBreakdown;
  departements: CropConditionDepartement[];
}

export interface CropCondition {
  campaign: CampaignRef;
  crops: CropConditionCrop[];
  /** Verdicts calculés sur des séries synthétiques de démonstration, pas sur Copernicus. */
  demo: boolean;
}

function emptyBreakdown(): ConditionBreakdown {
  const byClass = Object.fromEntries(
    CONDITION_CLASSES.map((c) => [c, { parcels: 0, areaHa: 0 }]),
  ) as ConditionBreakdown["byClass"];
  return { parcels: 0, areaHa: 0, byClass, goodShare: null, poorShare: null, toVerifyShare: null };
}

function add(target: ConditionBreakdown, row: CropConditionRow): void {
  target.parcels += row.parcels;
  target.areaHa += row.area_ha;
  target.byClass[row.condition].parcels += row.parcels;
  target.byClass[row.condition].areaHa += row.area_ha;
}

function withShares(breakdown: ConditionBreakdown): ConditionBreakdown {
  const observed = breakdown.areaHa - breakdown.byClass.UNOBSERVED.areaHa;
  if (observed <= 0) return breakdown;
  return {
    ...breakdown,
    goodShare: breakdown.byClass.GOOD.areaHa / observed,
    poorShare: breakdown.byClass.POOR.areaHa / observed,
    toVerifyShare: breakdown.byClass.TO_VERIFY.areaHa / observed,
  };
}

/** Regroupe les lignes SQL par culture puis département ; les cultures les plus étendues d'abord. */
export function buildCropCondition(rows: readonly CropConditionRow[]): CropConditionCrop[] {
  const crops = new Map<
    string,
    {
      name: string;
      national: ConditionBreakdown;
      deps: Map<string, { name: string; b: ConditionBreakdown }>;
    }
  >();
  for (const row of rows) {
    const crop = crops.get(row.crop_code) ?? {
      name: row.crop_name,
      national: emptyBreakdown(),
      deps: new Map(),
    };
    add(crop.national, row);
    const dep = crop.deps.get(row.departement_code) ?? {
      name: row.departement_name,
      b: emptyBreakdown(),
    };
    add(dep.b, row);
    crop.deps.set(row.departement_code, dep);
    crops.set(row.crop_code, crop);
  }
  return [...crops.entries()]
    .map(([code, crop]) => ({
      code,
      name: crop.name,
      national: withShares(crop.national),
      departements: [...crop.deps.entries()]
        .map(([depCode, dep]) => {
          const masked = dep.b.parcels < K_ANONYMITY;
          return {
            code: depCode,
            name: dep.name,
            masked,
            breakdown: masked ? null : withShares(dep.b),
          };
        })
        .sort((a, b) => (b.breakdown?.areaHa ?? 0) - (a.breakdown?.areaHa ?? 0)),
    }))
    .sort((a, b) => b.national.areaHa - a.national.areaHa);
}

export async function getCropCondition(
  actor: Actor,
  input: { campaignCode?: string } = {},
): Promise<CropCondition> {
  requireNational(await analyticsScope(actor));
  const { current } = resolveCampaign(await readCampaigns(), input.campaignCode);
  const [rows, demo] = await Promise.all([
    readCropCondition(current.id),
    readConditionIsDemo(current.id),
  ]);
  return { campaign: toCampaignRef(current), crops: buildCropCondition(rows), demo };
}
