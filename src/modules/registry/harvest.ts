import { prisma } from "@/database/client";
import type { Actor } from "@/modules/authorization";
import { applySyncBatch, type SyncApplyResult } from "@/modules/sync";
import { getFarmDetail, type FarmDetail } from "./farms";
import { listCampaigns } from "./reference";

// Déclaration de récolte en ligne (espace agriculteur et fiche agent) et historique par
// campagne. La déclaration passe par la même commande harvest.declare que l'outbox hors
// ligne : une seule voie d'écriture, une seule validation.

export type HarvestUnitCode = "KG" | "T" | "BAG_100KG" | "BAG_50KG" | "BUNCH" | "HEAP" | "BASIN";

export interface DeclarableCropSeason {
  parcelCropId: string;
  parcelId: string;
  parcelCode: string;
  cropCode: string;
  cropName: string;
  campaignCode: string;
  areaHa: number;
  stage: string;
  tradeUnit: HarvestUnitCode;
  /** Premier jour du mois de récolte attendu d'après le calendrier de la culture, ou null. */
  expectedHarvestOn: Date | null;
}

interface CropCalendarJson {
  south?: { harvest?: [number, number] };
  north?: { harvest?: [number, number] };
}

/** Date du mois de récolte dans la campagne (avril à mars) : un mois avant avril tombe l'année suivante. */
export function expectedHarvestDate(
  calendar: unknown,
  regime: "BIMODAL" | "UNIMODAL" | null,
  campaignStartYear: number,
): Date | null {
  const windows = (calendar ?? {}) as CropCalendarJson;
  const window =
    regime === "BIMODAL" ? (windows.south ?? windows.north) : (windows.north ?? windows.south);
  const month = window?.harvest?.[0];
  if (!month || month < 1 || month > 12) return null;
  const year = month >= 4 ? campaignStartYear : campaignStartYear + 1;
  return new Date(Date.UTC(year, month - 1, 1));
}

async function openCampaign(): Promise<{ id: string; code: string; startYear: number } | null> {
  const open = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN", archivedAt: null },
    orderBy: { startYear: "desc" },
    select: { id: true, code: true, startYear: true },
  });
  return open;
}

export async function listDeclarableCropSeasons(
  actor: Actor,
  farmId: string,
): Promise<DeclarableCropSeason[]> {
  const [detail, campaign] = await Promise.all([getFarmDetail(actor, farmId), openCampaign()]);
  if (!detail || !campaign) return [];

  const commune = await prisma.commune.findUnique({
    where: { code: detail.commune.code },
    select: { zone: { select: { rainfallRegime: true } } },
  });
  const regime = commune?.zone?.rainfallRegime ?? null;

  const cropCodes = new Set(detail.parcels.flatMap((p) => p.crops.map((c) => c.cropCode)));
  const crops = await prisma.crop.findMany({
    where: { code: { in: [...cropCodes] } },
    select: { code: true, calendar: true, tradeUnit: true },
  });
  const cropInfo = new Map(crops.map((c) => [c.code, c]));

  const seasons: DeclarableCropSeason[] = [];
  for (const parcel of detail.parcels) {
    for (const crop of parcel.crops) {
      if (crop.campaignCode !== campaign.code || crop.stage === "FAILED") continue;
      const info = cropInfo.get(crop.cropCode);
      seasons.push({
        parcelCropId: crop.id,
        parcelId: parcel.id,
        parcelCode: parcel.code,
        cropCode: crop.cropCode,
        cropName: crop.cropName,
        campaignCode: crop.campaignCode,
        areaHa: crop.areaHa,
        stage: crop.stage,
        tradeUnit: (info?.tradeUnit ?? "KG") as HarvestUnitCode,
        expectedHarvestOn: expectedHarvestDate(info?.calendar, regime, campaign.startYear),
      });
    }
  }
  return seasons.sort((a, b) => {
    const da = a.expectedHarvestOn?.getTime() ?? Number.POSITIVE_INFINITY;
    const db = b.expectedHarvestOn?.getTime() ?? Number.POSITIVE_INFINITY;
    return (
      da - db ||
      a.cropName.localeCompare(b.cropName, "fr") ||
      a.parcelCode.localeCompare(b.parcelCode)
    );
  });
}

export interface DeclareHarvestInput {
  parcelCropId: string;
  declaredQuantity: number;
  unit: HarvestUnitCode;
  lossesPct?: number;
  lossCause?: string;
  priceHintFcfaPerKg?: number;
}

const WEB_DEVICE_ID = "web-server";

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Construit une commande harvest.declare et l'applique immédiatement par le serveur de synchronisation. */
export async function declareHarvestOnline(
  actor: Actor,
  input: DeclareHarvestInput,
  now = new Date(),
): Promise<SyncApplyResult> {
  const id = crypto.randomUUID();
  const declaredBy = actor.grants.some((g) => g.role === "AGENT_AGRICULTURE") ? "AGENT" : "FARMER";
  const command = {
    id,
    type: "harvest.declare",
    idempotencyKey: `web-${id}`,
    clientCreatedAt: now.toISOString(),
    deviceId: WEB_DEVICE_ID,
    payload: {
      id,
      parcelCropId: input.parcelCropId,
      declaredQuantity: input.declaredQuantity,
      unit: input.unit,
      declaredOn: isoDateOnly(now),
      declaredBy,
      lossesPct: input.lossesPct,
      lossCause: input.lossCause,
      priceHintFcfaPerKg: input.priceHintFcfaPerKg,
    },
  };
  const [result] = await applySyncBatch(actor, WEB_DEVICE_ID, [command]);
  if (!result) throw new Error("Le serveur de synchronisation n'a renvoyé aucun résultat");
  return result;
}

export interface HarvestDeclarationSummary {
  id: string;
  declaredOn: Date;
  declaredQuantity: number;
  unit: string;
  quantityKg: number;
}

export interface CampaignCropHistory {
  parcelCropId: string;
  parcelCode: string;
  cropCode: string;
  cropName: string;
  subSeason: string;
  areaHa: number;
  stage: string;
  declarations: HarvestDeclarationSummary[];
  totalKg: number;
}

export interface CampaignHistory {
  campaignCode: string;
  status: "PLANNED" | "OPEN" | "CLOSED";
  crops: CampaignCropHistory[];
  totalAreaHa: number;
  totalKg: number;
  /** Kilogrammes récoltés par code de culture, pour la comparaison entre campagnes. */
  kgByCrop: Record<string, number>;
}

export interface HarvestHistory {
  farm: Pick<FarmDetail, "id" | "code" | "name" | "commune" | "village">;
  campaigns: CampaignHistory[];
  events: FarmDetail["events"];
}

export async function listHarvestHistory(
  actor: Actor,
  farmId: string,
): Promise<HarvestHistory | null> {
  const [detail, campaigns] = await Promise.all([getFarmDetail(actor, farmId), listCampaigns()]);
  if (!detail) return null;

  const byCampaign = new Map<string, CampaignCropHistory[]>();
  for (const parcel of detail.parcels) {
    for (const crop of parcel.crops) {
      const totalKg = crop.declarations.reduce((sum, d) => sum + d.quantityKg, 0);
      const list = byCampaign.get(crop.campaignCode) ?? [];
      list.push({
        parcelCropId: crop.id,
        parcelCode: parcel.code,
        cropCode: crop.cropCode,
        cropName: crop.cropName,
        subSeason: crop.subSeason,
        areaHa: crop.areaHa,
        stage: crop.stage,
        declarations: crop.declarations,
        totalKg,
      });
      byCampaign.set(crop.campaignCode, list);
    }
  }

  const history: CampaignHistory[] = campaigns
    .filter((c) => byCampaign.has(c.code) || c.status === "OPEN")
    .map((c) => {
      const crops = (byCampaign.get(c.code) ?? []).sort((a, b) =>
        a.cropName.localeCompare(b.cropName, "fr"),
      );
      const kgByCrop: Record<string, number> = {};
      for (const crop of crops)
        kgByCrop[crop.cropCode] = (kgByCrop[crop.cropCode] ?? 0) + crop.totalKg;
      return {
        campaignCode: c.code,
        status: c.status,
        crops,
        totalAreaHa: crops.reduce((sum, crop) => sum + crop.areaHa, 0),
        totalKg: crops.reduce((sum, crop) => sum + crop.totalKg, 0),
        kgByCrop,
      };
    });

  return {
    farm: {
      id: detail.id,
      code: detail.code,
      name: detail.name,
      commune: detail.commune,
      village: detail.village,
    },
    campaigns: history,
    events: [...detail.events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
  };
}
