import { prisma } from "@/database/client";
import {
  findCommuneContainingPoint,
  listCommuneGeometries,
  type CommuneGeometry,
  type CommuneHit,
} from "@/database/sql/territory.sql";

export interface DepartementSummary {
  code: string;
  name: string;
  chefLieu: string;
  communeCount: number;
}

export async function listDepartements(): Promise<DepartementSummary[]> {
  const rows = await prisma.departement.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: { code: true, name: true, chefLieu: true, _count: { select: { communes: true } } },
  });
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    chefLieu: row.chefLieu,
    communeCount: row._count.communes,
  }));
}

export interface CommuneSummary {
  code: string;
  name: string;
  departementCode: string;
  zoneCode: string | null;
}

export async function listCommunes(departementCode?: string): Promise<CommuneSummary[]> {
  const rows = await prisma.commune.findMany({
    where: {
      archivedAt: null,
      ...(departementCode ? { departement: { code: departementCode } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      code: true,
      name: true,
      departement: { select: { code: true } },
      zone: { select: { code: true } },
    },
  });
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    departementCode: row.departement.code,
    zoneCode: row.zone?.code ?? null,
  }));
}

// Recherche tolérante : accents ignorés, alias acceptés (Sèmè-Podji → Sèmè-Kpodji).
export async function searchCommunes(term: string, limit = 10): Promise<CommuneSummary[]> {
  const normalized = term.trim();
  if (normalized.length < 2) return [];
  const rows = await prisma.commune.findMany({
    where: {
      archivedAt: null,
      OR: [
        { name: { contains: normalized, mode: "insensitive" } },
        { aliases: { has: normalized } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      code: true,
      name: true,
      departement: { select: { code: true } },
      zone: { select: { code: true } },
    },
  });
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    departementCode: row.departement.code,
    zoneCode: row.zone?.code ?? null,
  }));
}

export function locateCommune(longitude: number, latitude: number): Promise<CommuneHit | null> {
  return findCommuneContainingPoint(longitude, latitude);
}

export function communeGeometries(): Promise<CommuneGeometry[]> {
  return listCommuneGeometries();
}
