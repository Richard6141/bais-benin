import { prisma } from "@/database/client";

// Référentiels agricoles exposés aux écrans (filtres de la carte, formulaires) :
// cultures et campagnes, sans détail interne.

export interface CropOption {
  code: string;
  nameFr: string;
  colorHex: string | null;
}

export interface CampaignOption {
  code: string;
  startYear: number;
  status: "PLANNED" | "OPEN" | "CLOSED";
}

export async function listCrops(): Promise<CropOption[]> {
  return prisma.crop.findMany({
    where: { archivedAt: null },
    orderBy: { nameFr: "asc" },
    select: { code: true, nameFr: true, colorHex: true },
  });
}

export async function listCampaigns(): Promise<CampaignOption[]> {
  return prisma.agriculturalCampaign.findMany({
    where: { archivedAt: null },
    orderBy: { startYear: "desc" },
    select: { code: true, startYear: true, status: true },
  });
}
