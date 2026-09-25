import { prisma } from "@/database/client";
import { actorTerritory, type Actor } from "@/modules/authorization";

// Traduction du périmètre territorial d'un acteur en communes concrètes. Le ministère
// (portée nationale) voit tout ; un agent voit ses communes et celles de ses départements ;
// un rôle sans périmètre territorial ne voit aucune commune.

export interface ScopedCommune {
  id: string;
  code: string;
  name: string;
  departementName: string;
}

export type CommuneScope = "all" | "none" | ScopedCommune[];

export async function scopedCommunes(actor: Actor): Promise<CommuneScope> {
  const filter = actorTerritory(actor);
  if (filter.kind === "all") return "all";
  if (filter.kind !== "territory") return "none";
  const or: Array<{ id?: { in: string[] }; departementId?: { in: string[] } }> = [];
  if (filter.communeIds.length > 0) or.push({ id: { in: filter.communeIds } });
  if (filter.departementIds.length > 0) or.push({ departementId: { in: filter.departementIds } });
  if (or.length === 0) return "none";
  const rows = await prisma.commune.findMany({
    where: { OR: or, archivedAt: null },
    select: { id: true, code: true, name: true, departement: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    departementName: row.departement.name,
  }));
}

// Identifiants de communes pour filtrer une requête (tuiles de points, listes).
export async function scopedCommuneIds(actor: Actor): Promise<"all" | string[]> {
  const scope = await scopedCommunes(actor);
  if (scope === "all") return "all";
  if (scope === "none") return [];
  return scope.map((c) => c.id);
}
