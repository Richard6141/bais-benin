import { describe, expect, it } from "vitest";
import { priorityReasons } from "./priority";

const now = new Date("2026-09-24T10:00:00Z");

describe("priorité de vérification", () => {
  it("ne signale rien pour une petite exploitation récente et cohérente", () => {
    expect(
      priorityReasons(
        {
          declaredAreaHa: 2,
          computedAreaHa: 2.1,
          parcelCount: 1,
          createdAt: "2026-09-01T00:00:00Z",
        },
        now,
      ),
    ).toEqual([]);
  });

  it("cumule les motifs : écart de surface, grande surface, sans parcelle, ancienneté", () => {
    expect(
      priorityReasons(
        {
          declaredAreaHa: 12,
          computedAreaHa: 8,
          parcelCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
        },
        now,
      ),
    ).toEqual(["AREA_GAP", "LARGE_AREA", "NO_PARCEL", "OLD"]);
  });

  it("ignore l'écart quand la surface mesurée manque", () => {
    expect(
      priorityReasons(
        {
          declaredAreaHa: 3,
          computedAreaHa: null,
          parcelCount: 2,
          createdAt: "2026-09-20T00:00:00Z",
        },
        now,
      ),
    ).toEqual([]);
  });
});
