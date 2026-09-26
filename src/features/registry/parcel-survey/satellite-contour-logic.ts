import type { CandidateLevel, ProposedContour } from "@/modules/satellite";
import { choroplethScale } from "@/styles/tokens";

// Logique de l'écran « Depuis le satellite » (ADR-0016, phase 3), sans React ni carte.

export const LEVEL_LABELS: Record<CandidateLevel, string> = {
  TIGHT: "Serré",
  MEDIUM: "Moyen",
  WIDE: "Large",
};

/** Trois teintes franchement distinctes de l'échelle des données (ni rouge ni orange). */
export const LEVEL_COLORS: Record<CandidateLevel, string> = {
  TIGHT: choroplethScale[4],
  MEDIUM: choroplethScale[6],
  WIDE: choroplethScale[2],
};

/** Candidat proposé d'office : le plus sûr, qui ne déborde pas de la fenêtre si possible. */
export function recommendedCandidate(
  candidates: readonly ProposedContour[],
): ProposedContour | null {
  if (candidates.length === 0) return null;
  const inside = candidates.filter((candidate) => !candidate.touchesEdge);
  const pool = inside.length > 0 ? inside : candidates;
  return pool.reduce((best, candidate) =>
    candidate.confidence > best.confidence ? candidate : best,
  );
}

/** Déplace un sommet d'un anneau fermé ; le premier et le dernier point restent confondus. */
export function moveVertex(
  ring: readonly [number, number][],
  index: number,
  to: [number, number],
): [number, number][] {
  const next = ring.map((point) => [...point] as [number, number]);
  const last = next.length - 1;
  if (index < 0 || index >= last) return next;
  next[index] = to;
  if (index === 0) next[last] = to;
  return next;
}

/** Retire un sommet (au moins trois restent) ; l'anneau reste fermé. */
export function removeVertex(ring: readonly [number, number][], index: number): [number, number][] {
  const open = ring.slice(0, -1);
  if (open.length <= 3 || index < 0 || index >= open.length)
    return ring.map((p) => [...p] as [number, number]);
  const kept = open.filter((_, i) => i !== index);
  return [...kept, kept[0] as [number, number]];
}
