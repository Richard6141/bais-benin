import type { CommandTarget, Db } from "./types";

// Résolutions partagées par les handlers : commune par code, exploitation avec son territoire
// et son producteur, pour construire la ressource d'autorisation (commune, département,
// propriétaire) évaluée par le moteur rôle × action × portée.

export interface CommuneRef {
  id: string;
  name: string;
  departementId: string;
  departementName: string;
}

export async function findCommuneByCode(db: Db, code: string): Promise<CommuneRef | null> {
  const commune = await db.commune.findFirst({
    where: { code, archivedAt: null },
    select: { id: true, name: true, departementId: true, departement: { select: { name: true } } },
  });
  if (!commune) return null;
  return {
    id: commune.id,
    name: commune.name,
    departementId: commune.departementId,
    departementName: commune.departement.name,
  };
}

export interface FarmRef {
  id: string;
  code: string;
  version: number;
  communeId: string;
  departementId: string;
  ownerUserId: string | null;
  registeredByUserId: string | null;
  declaredAreaHa: number;
}

export async function findFarm(db: Db, farmId: string): Promise<FarmRef | null> {
  const farm = await db.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: {
      id: true,
      code: true,
      version: true,
      communeId: true,
      declaredAreaHa: true,
      registeredById: true,
      commune: { select: { departementId: true } },
      farmer: { select: { userId: true } },
    },
  });
  if (!farm) return null;
  return {
    id: farm.id,
    code: farm.code,
    version: farm.version,
    communeId: farm.communeId,
    departementId: farm.commune.departementId,
    ownerUserId: farm.farmer.userId,
    registeredByUserId: farm.registeredById,
    declaredAreaHa: Number(farm.declaredAreaHa),
  };
}

export async function findFarmOfParcel(db: Db, parcelId: string): Promise<FarmRef | null> {
  const parcel = await db.parcel.findFirst({
    where: { id: parcelId, archivedAt: null },
    select: { farmId: true },
  });
  return parcel ? findFarm(db, parcel.farmId) : null;
}

export function farmTarget(farm: FarmRef, action: CommandTarget["action"]): CommandTarget {
  return {
    action,
    resource: {
      communeId: farm.communeId,
      departementId: farm.departementId,
      ownerUserId: farm.ownerUserId,
      registeredByUserId: farm.registeredByUserId,
    },
  };
}
