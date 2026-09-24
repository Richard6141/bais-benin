import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  generateSyntheticRegistry,
  type CommuneInput,
  type CropInput,
  type SyntheticRegistry,
} from "../generators";
import { attachDemoFarmerAccount } from "./accounts.seed";

// Registre synthétique de démonstration (docs/08 §6). Le générateur est déterministe :
// même graine, même jeu de données. Le volume par défaut reste modeste pour un poste de
// développement ; SEED_FARM_COUNT=50000 produit le jeu complet.

const DEFAULT_FARM_COUNT = 5_000;
const DEFAULT_SEED = 20_260_924;
const BATCH = 1_000;

const geometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.any(),
});

const communeRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  zone_code: z.string().nullable(),
  area_km2: z.coerce.number().nullable(),
  geometry: z.string(),
});

// Poids relatif : surface communale pondérée par l'intensité agricole de la zone, à défaut
// de population rurale par commune (INStaD, à connecter). Le Littoral (Cotonou) reste faible.
const ZONE_INTENSITY: Record<string, number> = {
  ZAE_1: 0.8,
  ZAE_2: 1.4,
  ZAE_3: 1.1,
  ZAE_4: 1.0,
  ZAE_5: 1.2,
  ZAE_6: 1.0,
  ZAE_7: 0.9,
  ZAE_8: 0.4,
};

async function loadCommuneInputs(prisma: PrismaClient): Promise<CommuneInput[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name", d."code" AS departement_code, d."name" AS departement_name,
           z."code" AS zone_code, c."area_km2", ST_AsGeoJSON(c."geom"::geometry, 6) AS geometry
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
    WHERE c."archived_at" IS NULL AND c."geom" IS NOT NULL`;
  return rows.map((raw) => {
    const row = communeRowSchema.parse(raw);
    const zoneCode = row.zone_code ?? "ZAE_6";
    const area = row.area_km2 ?? 500;
    const weight =
      row.code === "BJ-LIT-001" ? 0.2 : Math.sqrt(area) * (ZONE_INTENSITY[zoneCode] ?? 1);
    return {
      code: row.code,
      name: row.name,
      departementCode: row.departement_code,
      departementName: row.departement_name,
      zoneCode,
      ruralPopulationWeight: weight,
      polygon: geometrySchema.parse(JSON.parse(row.geometry)) as CommuneInput["polygon"],
    };
  });
}

async function loadCropInputs(prisma: PrismaClient): Promise<CropInput[]> {
  const crops = await prisma.crop.findMany({
    where: { archivedAt: null },
    select: { code: true, mainZoneCodes: true, cycle: true, calendar: true },
  });
  const calendarSchema = z.object({
    south: z.object({ harvest: z.tuple([z.number(), z.number()]) }).optional(),
    north: z.object({ harvest: z.tuple([z.number(), z.number()]) }).optional(),
  });
  return crops.map((crop) => ({
    code: crop.code,
    mainZoneCodes: crop.mainZoneCodes,
    cycle: crop.cycle,
    calendar: calendarSchema.parse(crop.calendar),
  }));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

async function insertRegistry(prisma: PrismaClient, registry: SyntheticRegistry) {
  const communes = await prisma.commune.findMany({ select: { id: true, code: true } });
  const communeIdByCode = new Map(communes.map((c) => [c.code, c.id]));
  const crops = await prisma.crop.findMany({ select: { id: true, code: true } });
  const cropIdByCode = new Map(crops.map((c) => [c.code, c.id]));
  const campaigns = await prisma.agriculturalCampaign.findMany({
    select: { id: true, code: true },
  });
  const campaignIdByCode = new Map(campaigns.map((c) => [c.code, c.id]));
  const sourceDate = new Date("2026-09-24T00:00:00Z");

  for (const batch of chunk(registry.farmers, BATCH)) {
    await prisma.farmer.createMany({
      data: batch.map((farmer) => ({
        id: farmer.id,
        code: farmer.code,
        firstName: farmer.firstName,
        lastName: farmer.lastName,
        gender: farmer.gender === "F" ? "F" : "M",
        birthYear: farmer.birthYear,
        phoneE164: farmer.phone,
        householdSize: farmer.householdSize,
        communeId: communeIdByCode.get(farmer.communeCode) as string,
        sourceId: farmer.sourceId,
        sourceDate,
        reliability: farmer.reliability,
      })),
      skipDuplicates: true,
    });
  }

  for (const batch of chunk(registry.farms, BATCH)) {
    await prisma.farm.createMany({
      data: batch.map((farm) => ({
        id: farm.id,
        code: farm.code,
        farmerId: farm.farmerId,
        communeId: communeIdByCode.get(farm.communeCode) as string,
        declaredAreaHa: farm.totalAreaHa,
        verificationStatus: farm.verificationStatus,
        verifiedAt: farm.verificationStatus === "DECLARED" ? null : sourceDate,
        sourceId: farm.sourceId,
        sourceDate,
        reliability: farm.reliability,
      })),
      skipDuplicates: true,
    });
    // Les positions passent par SQL : Prisma ne sait pas écrire une colonne geography.
    const values = batch.map(
      (farm) =>
        Prisma.sql`(${farm.id}::uuid, ${farm.location[0]}::float8, ${farm.location[1]}::float8)`,
    );
    await prisma.$executeRaw`
      UPDATE "farm" f SET "location" = ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography
      FROM (VALUES ${Prisma.join(values)}) AS v(id, lon, lat)
      WHERE f."id" = v.id`;
  }

  for (const batch of chunk(registry.parcels, BATCH)) {
    await prisma.parcel.createMany({
      data: batch.map((parcel) => ({
        id: parcel.id,
        code: parcel.code,
        farmId: parcel.farmId,
        declaredAreaHa: parcel.declaredAreaHa,
        computedAreaHa: parcel.computedAreaHa,
        captureMethod: "GPS_WALK",
        sourceId: parcel.sourceId,
        sourceDate,
        reliability: parcel.reliability,
      })),
      skipDuplicates: true,
    });
    const values = batch.map(
      (parcel) => Prisma.sql`(${parcel.id}::uuid, ${JSON.stringify(parcel.geometry)}::text)`,
    );
    await prisma.$executeRaw`
      UPDATE "parcel" p
      SET "geom" = ST_SetSRID(ST_GeomFromGeoJSON(v.geojson), 4326)::geography,
          "centroid" = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(v.geojson), 4326))::geography
      FROM (VALUES ${Prisma.join(values)}) AS v(id, geojson)
      WHERE p."id" = v.id`;
  }

  for (const batch of chunk(registry.parcelCrops, BATCH)) {
    await prisma.parcelCrop.createMany({
      data: batch.map((pc) => ({
        id: pc.id,
        parcelId: pc.parcelId,
        cropId: cropIdByCode.get(pc.cropCode) as string,
        campaignId: campaignIdByCode.get(pc.campaignCode) as string,
        subSeason: pc.seasonCode,
        areaHa: pc.areaHa,
        stage: "GROWING",
        sourceId: pc.sourceId,
        sourceDate,
        reliability: pc.reliability,
      })),
      skipDuplicates: true,
    });
  }

  // Superficie calculée de chaque exploitation : somme des parcelles mesurées.
  await prisma.$executeRaw`
    UPDATE "farm" f SET "computed_area_ha" = s.total
    FROM (SELECT "farm_id", SUM("computed_area_ha") AS total FROM "parcel" WHERE "archived_at" IS NULL GROUP BY "farm_id") s
    WHERE f."id" = s."farm_id" AND f."source_id" = 'BAIS_SEED'`;
}

// Purge du registre synthétique (SEED_FARM_RESET=1) : utile après un changement de référentiel
// ou de générateur. Ne touche jamais aux données saisies sur le terrain (autre source).
export async function deleteSyntheticRegistry(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "parcel_crop" WHERE "source_id" = 'BAIS_SEED'`;
  await prisma.$executeRaw`DELETE FROM "parcel" WHERE "source_id" = 'BAIS_SEED'`;
  await prisma.$executeRaw`DELETE FROM "farm" WHERE "source_id" = 'BAIS_SEED'`;
  await prisma.$executeRaw`DELETE FROM "farmer" WHERE "source_id" = 'BAIS_SEED'`;
}

export interface FarmSeedSummary {
  farmers: number;
  farms: number;
  parcels: number;
  parcelCrops: number;
  skipped: boolean;
}

// Idempotent par construction : les identifiants sont déterministes et createMany ignore
// les doublons. Si le registre synthétique est déjà chargé, l'étape est sautée.
export async function seedSyntheticFarms(prisma: PrismaClient): Promise<FarmSeedSummary> {
  const summary = await loadOrGenerateRegistry(prisma);
  // Après le registre (chargé ou déjà présent), le compte agricultrice de démonstration est
  // relié à une exploitation de Djougou ; refait après SEED_FARM_RESET puisque les fermes changent.
  await attachDemoFarmerAccount(prisma);
  return summary;
}

async function loadOrGenerateRegistry(prisma: PrismaClient): Promise<FarmSeedSummary> {
  const farmCount = Number(process.env.SEED_FARM_COUNT ?? DEFAULT_FARM_COUNT);
  if (process.env.SEED_FARM_RESET === "1") await deleteSyntheticRegistry(prisma);
  const existing = await prisma.farm.count({ where: { sourceId: "BAIS_SEED" } });
  if (existing >= farmCount) {
    const [farmers, parcels, parcelCrops] = await Promise.all([
      prisma.farmer.count({ where: { sourceId: "BAIS_SEED" } }),
      prisma.parcel.count({ where: { sourceId: "BAIS_SEED" } }),
      prisma.parcelCrop.count({ where: { sourceId: "BAIS_SEED" } }),
    ]);
    return { farmers, farms: existing, parcels, parcelCrops, skipped: true };
  }

  const [communes, crops, campaignRows] = await Promise.all([
    loadCommuneInputs(prisma),
    loadCropInputs(prisma),
    prisma.agriculturalCampaign.findMany({
      where: { status: { in: ["CLOSED", "OPEN"] } },
      orderBy: { startYear: "asc" },
      select: { code: true, startYear: true },
    }),
  ]);
  const registry = generateSyntheticRegistry(
    { communes, crops, campaigns: campaignRows },
    { seed: DEFAULT_SEED, farmCount },
  );
  await insertRegistry(prisma, registry);
  return {
    farmers: registry.farmers.length,
    farms: registry.farms.length,
    parcels: registry.parcels.length,
    parcelCrops: registry.parcelCrops.length,
    skipped: false,
  };
}
