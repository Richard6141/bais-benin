import { prisma } from "@/database/client";
import { scopeFilter, type Actor } from "@/modules/authorization";
import type { DashboardFilters } from "./dashboard-types";
import { AnalyticsError } from "./dashboard-types";

// Périmètre de lecture des agrégats (droit analytics.read) : le ministère lit tout le territoire,
// un agent ses communes et celles de ses départements. Un rôle dont le périmètre n'est pas
// territorial (coopérative, producteur) obtient un périmètre vide tant que le registre ne relie
// pas les exploitations aux organisations : ses chiffres sont à zéro, jamais ceux des autres.
//
// `trusted` : l'acteur lit déjà les exploitations individuelles de son périmètre (farm.read).
// Pour lui, le masquage des petits effectifs est une règle de présentation ; pour les autres
// (acheteur, qui a une portée nationale sur les agrégats sans lire le registre), c'est une
// protection. Deux conséquences (revue de sécurité, C1) : le classement national exige un acteur
// de confiance, et le filtre par statut de vérification, qui permet de reconstituer une cellule
// masquée par différence entre statuts complémentaires, lui est réservé.

export type AnalyticsScope = (
  { national: true; communeIds: null } | { national: false; communeIds: string[] }
) & { trusted: boolean };

function readsFarms(actor: Actor): boolean {
  const kind = scopeFilter(actor, "farm.read").kind;
  return kind === "all" || kind === "territory";
}

export async function analyticsScope(actor: Actor): Promise<AnalyticsScope> {
  const filter = scopeFilter(actor, "analytics.read");
  const trusted = readsFarms(actor);
  if (filter.kind === "all") return { national: true, communeIds: null, trusted };
  if (filter.kind === "none") {
    throw new AnalyticsError("FORBIDDEN", "Lecture des agrégats non autorisée");
  }
  if (filter.kind === "self" || filter.kind === "registered") {
    return { national: false, communeIds: [], trusted };
  }
  const or: Array<{ id?: { in: string[] }; departementId?: { in: string[] } }> = [];
  if (filter.communeIds.length > 0) or.push({ id: { in: filter.communeIds } });
  if (filter.departementIds.length > 0) or.push({ departementId: { in: filter.departementIds } });
  if (or.length === 0) return { national: false, communeIds: [], trusted };
  const rows = await prisma.commune.findMany({
    where: { OR: or, archivedAt: null },
    select: { id: true },
  });
  return { national: false, communeIds: rows.map((r) => r.id), trusted };
}

/** Classements et comparaisons nommées : ministère seulement (pilotage-parcours-ux §2.F). */
export function requireNational(scope: AnalyticsScope): void {
  if (!scope.national || !scope.trusted) {
    throw new AnalyticsError("FORBIDDEN", "Classement national réservé au ministère");
  }
}

/** Filtre par statut de vérification : réservé aux acteurs qui lisent déjà le registre. */
export function assertFiltersAllowed(filters: DashboardFilters, scope: AnalyticsScope): void {
  if (filters.verificationStatus && !scope.trusted) {
    throw new AnalyticsError(
      "FORBIDDEN",
      "Le filtre par statut de vérification est réservé aux comptes qui consultent le registre",
    );
  }
}

/** Même règle pour l'API publique des statistiques : filtre réservé à la lecture nationale. */
export function canFilterByStatus(actor: Actor | null): boolean {
  return actor !== null && scopeFilter(actor, "farm.read").kind === "all";
}
