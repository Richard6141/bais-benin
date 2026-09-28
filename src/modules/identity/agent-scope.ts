// Périmètre d'un agent de terrain, tel que le ministère le choisit : des communes, des
// départements entiers, ou les deux. Règles sans base de données, testées à part.

export type AgentScopeType = "COMMUNE" | "DEPARTEMENT";

export interface AgentScopeEntry {
  scopeType: AgentScopeType;
  scopeId: string;
}

/** Au-delà, le choix relève d'une erreur de saisie plutôt que d'une affectation réelle. */
export const MAX_SCOPE_ENTRIES = 40;

/**
 * Affectations à enregistrer : les départements choisis, puis les communes qui n'y sont pas déjà
 * comprises (une commune d'un département choisi en entier ferait doublon). Sans doublon, dans
 * l'ordre de la saisie.
 */
export function normalizeAgentScope(
  communes: readonly { id: string; departementId: string }[],
  departementIds: readonly string[],
): AgentScopeEntry[] {
  const departements = [...new Set(departementIds)];
  const covered = new Set(departements);
  const seen = new Set<string>();
  const entries: AgentScopeEntry[] = departements.map((id) => ({
    scopeType: "DEPARTEMENT",
    scopeId: id,
  }));
  for (const commune of communes) {
    if (covered.has(commune.departementId) || seen.has(commune.id)) continue;
    seen.add(commune.id);
    entries.push({ scopeType: "COMMUNE", scopeId: commune.id });
  }
  return entries;
}

/** Écart entre les affectations en place et celles voulues : quoi accorder, quoi retirer. */
export function diffAgentScope<T extends { scopeType: string; scopeId: string | null }>(
  current: readonly T[],
  wanted: readonly AgentScopeEntry[],
): { toGrant: AgentScopeEntry[]; toRevoke: T[] } {
  const key = (entry: { scopeType: string; scopeId: string | null }) =>
    `${entry.scopeType}:${entry.scopeId ?? ""}`;
  const wantedKeys = new Set(wanted.map(key));
  const currentKeys = new Set(current.map(key));
  return {
    toGrant: wanted.filter((entry) => !currentKeys.has(key(entry))),
    toRevoke: current.filter((entry) => !wantedKeys.has(key(entry))),
  };
}
