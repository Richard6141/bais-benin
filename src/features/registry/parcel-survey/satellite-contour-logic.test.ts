import { describe, expect, it } from "vitest";
import type { ProposedContour } from "@/modules/satellite";
import {
  confidenceLabel,
  moveVertex,
  recommendedCandidate,
  removeVertex,
} from "./satellite-contour-logic";

const SQUARE: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

function candidate(level: ProposedContour["level"], confidence: number, touchesEdge = false) {
  return {
    level,
    confidence,
    touchesEdge,
    areaHa: 2,
    geometry: { type: "Polygon" as const, coordinates: [SQUARE] },
  };
}

describe("écran de contour proposé par le satellite", () => {
  it("recommande le candidat le plus sûr qui reste dans la fenêtre", () => {
    expect(
      recommendedCandidate([candidate("TIGHT", 0.7), candidate("WIDE", 0.9, true)])?.level,
    ).toBe("TIGHT");
    expect(recommendedCandidate([candidate("TIGHT", 0.4), candidate("MEDIUM", 0.8)])?.level).toBe(
      "MEDIUM",
    );
    expect(recommendedCandidate([])).toBeNull();
  });

  it("dit à l'agent ce que la confiance demande de faire", () => {
    expect(confidenceLabel(0.72)).toBe("confiance bonne");
    expect(confidenceLabel(0.38)).toBe("confiance moyenne : vérifiez les sommets");
    expect(confidenceLabel(0.17)).toMatch(/relevez à pied/);
  });

  it("garde l'anneau fermé quand l'agent déplace le premier sommet", () => {
    const moved = moveVertex(SQUARE, 0, [-0.1, -0.1]);
    expect(moved[0]).toEqual([-0.1, -0.1]);
    expect(moved[moved.length - 1]).toEqual([-0.1, -0.1]);
    expect(moveVertex(SQUARE, 2, [2, 2])[2]).toEqual([2, 2]);
  });

  it("retire un sommet sans descendre sous trois", () => {
    const triangle = removeVertex(SQUARE, 1);
    expect(triangle).toHaveLength(4);
    expect(triangle[0]).toEqual(triangle[3]);
    expect(removeVertex(triangle, 0)).toEqual(triangle);
  });
});
