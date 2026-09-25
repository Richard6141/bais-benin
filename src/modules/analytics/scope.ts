import { prisma } from "@/database/client";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { AnalyticsError } from "./dashboard-types";

// Périmètre de lecture des agrégats (droit analytics.read) : le ministère lit tout le territoire,
// un agent ses communes et celles de ses départements. Un rôle dont le périmètre n'est pas
// territorial (coopérative, producteur) obtient un périmètre vide tant que le registre ne relie
// pas les exploitations aux organisations : ses chiffres sont à zéro, jamais ceux des autres.

export type AnalyticsScope =
  { national: true; communeIds: null } | { national: false; communeIds: string[] };

export async function analyticsScope(actor: Actor): Promise<AnalyticsScope> {
  const filter = scopeFilter(actor, "analytics.read");
  if (filter.kind === "all") return { national: true, communeIds: null };
  if (filter.kind === "none") {
    throw new AnalyticsError("FORBIDDEN", "Lecture des agrégats non autorisée");
  }
  if (filter.kind === "self") return { national: false, communeIds: [] };
  const or: Array<{ id?: { in: string[] }; departementId?: { in: string[] } }> = [];
  if (filter.communeIds.length > 0) or.push({ id: { in: filter.communeIds } });
  if (filter.departementIds.length > 0) or.push({ departementId: { in: filter.departementIds } });
  if (or.length === 0) return { national: false, communeIds: [] };
  const rows = await prisma.commune.findMany({
    where: { OR: or, archivedAt: null },
    select: { id: true },
  });
  return { national: false, communeIds: rows.map((r) => r.id) };
}

/** Classements et comparaisons nommées : ministère seulement (pilotage-parcours-ux §2.F). */
export function requireNational(scope: AnalyticsScope): void {
  if (!scope.national) {
    throw new AnalyticsError("FORBIDDEN", "Classement national réservé au ministère");
  }
}
