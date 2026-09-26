// Classes de culture que le modèle parcelle par parcelle distingue (ADR-0030). Les cultures du
// registre dont la courbe de végétation est trop proche pour être séparées par satellite sont
// regroupées : sorgho et mil, igname et manioc, légumineuses et sésame.

export const CROP_GROUPS = [
  { key: "MAIZE", label: "Maïs", crops: ["MAIZE"] },
  { key: "SORGHUM_MILLET", label: "Sorgho ou mil", crops: ["SORGHUM", "MILLET"] },
  { key: "RICE", label: "Riz", crops: ["RICE"] },
  { key: "COTTON", label: "Coton", crops: ["COTTON"] },
  { key: "SOYBEAN", label: "Soja", crops: ["SOYBEAN"] },
  {
    key: "LEGUMES_OILSEEDS",
    label: "Niébé, arachide ou sésame",
    crops: ["COWPEA", "GROUNDNUT", "SESAME"],
  },
  {
    key: "ROOTS",
    label: "Igname, manioc ou patate douce",
    crops: ["YAM", "CASSAVA", "SWEET_POTATO"],
  },
  {
    key: "PERENNIAL",
    label: "Culture pérenne",
    crops: ["CASHEW", "OIL_PALM", "SHEA", "PLANTAIN", "PINEAPPLE"],
  },
  { key: "VEGETABLES", label: "Maraîchage", crops: ["TOMATO", "CHILI", "OKRA", "ONION"] },
] as const;

export type CropGroup = (typeof CROP_GROUPS)[number]["key"];

const GROUP_OF_CROP = new Map<string, CropGroup>(
  CROP_GROUPS.flatMap((group) => group.crops.map((crop) => [crop, group.key] as const)),
);

/** Classe du modèle d'une culture du registre ; null pour une culture inconnue. */
export function cropGroupOf(cropCode: string): CropGroup | null {
  return GROUP_OF_CROP.get(cropCode) ?? null;
}

/** Culture du registre quand la classe n'en contient qu'une (maïs, riz, coton, soja). */
export function singleCropOf(group: CropGroup): string | null {
  const crops = CROP_GROUPS.find((entry) => entry.key === group)?.crops ?? [];
  return crops.length === 1 ? crops[0]! : null;
}

export function cropGroupLabel(group: string): string {
  return CROP_GROUPS.find((entry) => entry.key === group)?.label ?? group;
}

export function isCropGroup(value: string): value is CropGroup {
  return CROP_GROUPS.some((entry) => entry.key === value);
}
