import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { authorize, scopeFilter, type Actor } from "@/modules/authorization";

// Lectures du registre. Le périmètre de l'acteur est traduit en clause Prisma avant
// la requête : aucune ligne hors périmètre ne quitte la base (docs/06 §3).

export interface FarmListItem {
  id: string;
  code: string;
  name: string | null;
  farmer: { id: string; code: string; displayName: string; phone: string | null };
  commune: { code: string; name: string };
  village: string | null;
  declaredAreaHa: number;
  computedAreaHa: number | null;
  verificationStatus: "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED" | "DISPUTED";
  verifiedAt: Date | null;
  parcelCount: number;
  cropCodes: string[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface FarmListFilters {
  communeCode?: string;
  verificationStatus?: FarmListItem["verificationStatus"];
  search?: string;
  limit?: number;
  cursor?: string;
}

function scopeWhere(actor: Actor): Prisma.FarmWhereInput | null {
  const filter = scopeFilter(actor, "farm.read");
  switch (filter.kind) {
    case "all":
      return {};
    case "none":
      return null;
    case "self":
      return { farmer: { userId: filter.userId } };
    case "territory": {
      const clauses: Prisma.FarmWhereInput[] = [];
      if (filter.communeIds.length > 0) clauses.push({ communeId: { in: filter.communeIds } });
      if (filter.departementIds.length > 0) {
        clauses.push({ commune: { departementId: { in: filter.departementIds } } });
      }
      if (filter.includeSelf) clauses.push({ farmer: { userId: actor.userId } });
      return clauses.length > 0 ? { OR: clauses } : null;
    }
  }
}

const listSelect = {
  id: true,
  code: true,
  name: true,
  village: true,
  declaredAreaHa: true,
  computedAreaHa: true,
  verificationStatus: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  farmer: { select: { id: true, code: true, firstName: true, lastName: true, phoneE164: true } },
  commune: { select: { code: true, name: true } },
  _count: { select: { parcels: { where: { archivedAt: null } } } },
  parcels: {
    where: { archivedAt: null },
    select: {
      crops: { where: { archivedAt: null }, select: { crop: { select: { code: true } } } },
    },
  },
} satisfies Prisma.FarmSelect;

type ListRow = Prisma.FarmGetPayload<{ select: typeof listSelect }>;

function toListItem(row: ListRow): FarmListItem {
  const cropCodes = [
    ...new Set(row.parcels.flatMap((p) => p.crops.map((c) => c.crop.code))),
  ].sort();
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    farmer: {
      id: row.farmer.id,
      code: row.farmer.code,
      displayName: `${row.farmer.firstName} ${row.farmer.lastName}`,
      phone: row.farmer.phoneE164,
    },
    commune: row.commune,
    village: row.village,
    declaredAreaHa: Number(row.declaredAreaHa),
    computedAreaHa: row.computedAreaHa === null ? null : Number(row.computedAreaHa),
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt,
    parcelCount: row._count.parcels,
    cropCodes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export async function listFarmsForActor(
  actor: Actor,
  filters: FarmListFilters = {},
): Promise<{ items: FarmListItem[]; nextCursor: string | null }> {
  const scope = scopeWhere(actor);
  if (scope === null) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const where: Prisma.FarmWhereInput = {
    AND: [
      scope,
      { archivedAt: null },
      filters.communeCode ? { commune: { code: filters.communeCode } } : {},
      filters.verificationStatus ? { verificationStatus: filters.verificationStatus } : {},
      filters.search
        ? {
            OR: [
              { code: { contains: filters.search, mode: "insensitive" } },
              { farmer: { lastName: { contains: filters.search, mode: "insensitive" } } },
              { farmer: { firstName: { contains: filters.search, mode: "insensitive" } } },
              { farmer: { phoneE164: { contains: filters.search.replace(/\s/g, "") } } },
            ],
          }
        : {},
    ],
  };
  const rows = await prisma.farm.findMany({
    where,
    select: listSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toListItem);
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export interface FarmDetail extends FarmListItem {
  location: { lng: number; lat: number } | null;
  tenure: string;
  mainActivity: string;
  parcels: Array<{
    id: string;
    code: string;
    declaredAreaHa: number;
    computedAreaHa: number | null;
    captureMethod: string;
    centroid: { lng: number; lat: number } | null;
    crops: Array<{
      id: string;
      cropCode: string;
      cropName: string;
      campaignCode: string;
      subSeason: string;
      areaHa: number;
      stage: string;
      declarations: Array<{
        id: string;
        declaredOn: Date;
        declaredQuantity: number;
        unit: string;
        quantityKg: number;
      }>;
    }>;
  }>;
  verifications: Array<{
    id: string;
    kind: string;
    outcome: string;
    visitedAt: Date;
    notes: string | null;
  }>;
  events: Array<{ id: string; kind: string; occurredAt: Date; payload: unknown }>;
  provenance: { sourceId: string; sourceDate: Date; reliability: string };
}

// Fiche complète : la décision d'accès porte sur la commune et le propriétaire de l'exploitation.
export async function getFarmDetail(actor: Actor, farmId: string): Promise<FarmDetail | null> {
  const row = await prisma.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: {
      ...listSelect,
      tenure: true,
      mainActivity: true,
      sourceId: true,
      sourceDate: true,
      reliability: true,
      communeId: true,
      farmer: {
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          phoneE164: true,
          userId: true,
        },
      },
      parcels: {
        where: { archivedAt: null },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          declaredAreaHa: true,
          computedAreaHa: true,
          captureMethod: true,
          crops: {
            where: { archivedAt: null },
            orderBy: [{ campaign: { startYear: "desc" } }],
            select: {
              id: true,
              areaHa: true,
              subSeason: true,
              stage: true,
              crop: { select: { code: true, nameFr: true } },
              campaign: { select: { code: true } },
              declarations: {
                where: { archivedAt: null },
                orderBy: { declaredOn: "desc" },
                select: {
                  id: true,
                  declaredOn: true,
                  declaredQuantity: true,
                  unit: true,
                  quantityKg: true,
                },
              },
            },
          },
        },
      },
      verifications: {
        orderBy: { visitedAt: "desc" },
        select: { id: true, kind: true, outcome: true, visitedAt: true, notes: true },
      },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 50,
        select: { id: true, kind: true, occurredAt: true, payload: true },
      },
    },
  });
  if (!row) return null;
  const decision = authorize(actor, "farm.read", {
    ownerUserId: row.farmer.userId,
    communeId: row.communeId,
  });
  if (!decision.allowed) return null;

  const points = await prisma.$queryRaw<{ id: string; kind: string; lng: number; lat: number }[]>`
    SELECT "id", 'farm' AS kind, ST_X("location"::geometry) AS lng, ST_Y("location"::geometry) AS lat
    FROM "farm" WHERE "id" = ${farmId}::uuid AND "location" IS NOT NULL
    UNION ALL
    SELECT "id", 'parcel' AS kind, ST_X("centroid"::geometry) AS lng, ST_Y("centroid"::geometry) AS lat
    FROM "parcel" WHERE "farm_id" = ${farmId}::uuid AND "centroid" IS NOT NULL`;
  const farmPoint = points.find((p) => p.kind === "farm");
  const parcelPoints = new Map(points.filter((p) => p.kind === "parcel").map((p) => [p.id, p]));

  return {
    ...toListItem(row),
    location: farmPoint ? { lng: farmPoint.lng, lat: farmPoint.lat } : null,
    tenure: row.tenure,
    mainActivity: row.mainActivity,
    parcels: row.parcels.map((parcel) => ({
      id: parcel.id,
      code: parcel.code,
      declaredAreaHa: Number(parcel.declaredAreaHa),
      computedAreaHa: parcel.computedAreaHa === null ? null : Number(parcel.computedAreaHa),
      captureMethod: parcel.captureMethod,
      centroid: parcelPoints.has(parcel.id)
        ? { lng: parcelPoints.get(parcel.id)!.lng, lat: parcelPoints.get(parcel.id)!.lat }
        : null,
      crops: parcel.crops.map((cs) => ({
        id: cs.id,
        cropCode: cs.crop.code,
        cropName: cs.crop.nameFr,
        campaignCode: cs.campaign.code,
        subSeason: cs.subSeason,
        areaHa: Number(cs.areaHa),
        stage: cs.stage,
        declarations: cs.declarations.map((d) => ({
          id: d.id,
          declaredOn: d.declaredOn,
          declaredQuantity: Number(d.declaredQuantity),
          unit: d.unit,
          quantityKg: Number(d.quantityKg),
        })),
      })),
    })),
    verifications: row.verifications,
    events: row.events,
    provenance: {
      sourceId: row.sourceId,
      sourceDate: row.sourceDate,
      reliability: row.reliability,
    },
  };
}

// File de vérification d'un agent : exploitations déclarées de son périmètre, les plus anciennes d'abord.
export async function verificationQueue(actor: Actor, limit = 50): Promise<FarmListItem[]> {
  const scope = scopeWhere(actor);
  if (scope === null) return [];
  const rows = await prisma.farm.findMany({
    where: { AND: [scope, { archivedAt: null }, { verificationStatus: "DECLARED" }] },
    select: listSelect,
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });
  return rows.map(toListItem);
}

// Exploitations d'un producteur connecté (espace agriculteur).
export async function listOwnFarms(userId: string): Promise<FarmListItem[]> {
  const rows = await prisma.farm.findMany({
    where: { archivedAt: null, farmer: { userId } },
    select: listSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toListItem);
}

export async function countFarmsForActor(
  actor: Actor,
): Promise<{ total: number; declared: number; verified: number }> {
  const scope = scopeWhere(actor);
  if (scope === null) return { total: 0, declared: 0, verified: 0 };
  const base: Prisma.FarmWhereInput = { AND: [scope, { archivedAt: null }] };
  const [total, declared, verified] = await Promise.all([
    prisma.farm.count({ where: base }),
    prisma.farm.count({ where: { AND: [base, { verificationStatus: "DECLARED" }] } }),
    prisma.farm.count({ where: { AND: [base, { verificationStatus: "FIELD_VERIFIED" }] } }),
  ]);
  return { total, declared, verified };
}
