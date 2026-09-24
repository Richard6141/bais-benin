import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { cropColors, type CropColorCode } from "@/styles/tokens";
import { AGRO_ECOLOGICAL_ZONES, CROPS, campaignWindow, buildSeasonCode } from "../reference";
import { DATA_SOURCES } from "../reference/data-sources";

// Date de référence des référentiels chargés : celle de la rédaction de docs/08.
export const REFERENCE_DATE = new Date("2026-09-24T00:00:00Z");

export async function seedDataSources(prisma: PrismaClient): Promise<number> {
  for (const source of DATA_SOURCES) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      create: { ...source },
      update: { ...source },
    });
  }
  return DATA_SOURCES.length;
}

export async function seedAgroEcologicalZones(prisma: PrismaClient): Promise<number> {
  for (const zone of AGRO_ECOLOGICAL_ZONES) {
    const data = {
      name: zone.name,
      rainfallRegime: zone.rainfallRegime,
      dominantSystems: [...zone.dominantSystems],
      indicativeRainfallMin: zone.indicativeRainfallMm[0],
      indicativeRainfallMax: zone.indicativeRainfallMm[1],
      departementCodes: [...zone.departementCodes],
      sourceId: "BAIS_SEED",
      sourceDate: REFERENCE_DATE,
      reliability: "ESTIMATED" as const,
    };
    await prisma.agroEcologicalZone.upsert({
      where: { code: zone.code },
      create: { code: zone.code, ...data },
      update: data,
    });
  }
  return AGRO_ECOLOGICAL_ZONES.length;
}

function cropColor(code: string): string | null {
  return code in cropColors ? cropColors[code as CropColorCode] : null;
}

export async function seedCrops(prisma: PrismaClient): Promise<number> {
  for (const crop of CROPS) {
    const data = {
      nameFr: crop.nameFr,
      category: crop.category,
      cycle: crop.cycle,
      tradeUnit: crop.tradeUnit,
      typicalYieldTPerHa: crop.typicalYieldTPerHa ?? null,
      mainZoneCodes: [...crop.mainZones],
      // Les tuples en lecture seule du référentiel ne sont pas un InputJsonValue pour Prisma.
      calendar: structuredClone(crop.calendar) as unknown as Prisma.InputJsonValue,
      colorHex: cropColor(crop.code),
      sourceId: crop.sourceId,
      sourceDate: REFERENCE_DATE,
      reliability: crop.reliability,
    };
    await prisma.crop.upsert({
      where: { code: crop.code },
      create: { code: crop.code, ...data },
      update: data,
    });
  }
  return CROPS.length;
}

// Campagnes chargées : deux passées (historique), la campagne courante (2026-2027, ouverte
// depuis le 1er avril 2026) et la suivante, planifiée.
const CAMPAIGN_START_YEARS = [2024, 2025, 2026, 2027] as const;

export function campaignStatusFor(startYear: number, today: Date): "PLANNED" | "OPEN" | "CLOSED" {
  const { startsOn, endsOn } = campaignWindow(startYear);
  if (today < new Date(startsOn)) return "PLANNED";
  if (today > new Date(endsOn)) return "CLOSED";
  return "OPEN";
}

export async function seedCampaigns(prisma: PrismaClient, today = new Date()): Promise<number> {
  for (const startYear of CAMPAIGN_START_YEARS) {
    const { startsOn, endsOn } = campaignWindow(startYear);
    const data = {
      startsOn: new Date(startsOn),
      endsOn: new Date(endsOn),
      status: campaignStatusFor(startYear, today),
      sourceId: "MAEP_DSA",
      sourceDate: REFERENCE_DATE,
      reliability: "OFFICIAL" as const,
    };
    await prisma.agriculturalCampaign.upsert({
      where: { startYear },
      create: { code: buildSeasonCode(startYear), startYear, ...data },
      update: data,
    });
  }
  return CAMPAIGN_START_YEARS.length;
}
