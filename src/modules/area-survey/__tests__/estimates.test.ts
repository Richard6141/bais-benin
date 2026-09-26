import { describe, expect, it, vi } from "vitest";
import type { SurveyPointRecord } from "@/database/sql/area-survey.sql";
import { CROP_AREA_METHOD_VERSION } from "@/modules/satellite/crop-areas";
import { citationStatus, estimateSurvey } from "../estimates";

vi.mock("@/database/client", () => ({ prisma: {} }));

// Surfaces par sondage (ADR-0033) : régression sur la carte dans chaque commune, repli direct,
// non-réponse, communes additionnées et règle de citation.

function point(
  commune: string,
  index: number,
  mapClass: string | null,
  landCover: string | null,
  cropCode: string | null = null,
): SurveyPointRecord {
  return {
    id: `${commune}-${index}`,
    code: `${commune}-${String(index).padStart(3, "0")}`,
    latitude: 9,
    longitude: 2,
    commune_id: commune,
    commune_code: `BJ-${commune}`,
    commune_name: `Commune ${commune}`,
    commune_area_ha: 10_000,
    map_class: mapClass,
    map_method_version: mapClass === null ? null : CROP_AREA_METHOD_VERSION,
    map_source_id: "COPERNICUS_S2",
    land_cover: landCover,
    crop_code: cropCode,
    observed_at: landCover ? new Date("2026-08-20") : null,
    observation_source_id: landCover ? "ATDA_TERRAIN" : null,
  };
}

/** 100 points : la carte voit des cultures annuelles sur 40, l'agent du maïs sur 30 d'entre eux
 * et sur 5 des 60 autres. */
function commune(id: string): SurveyPointRecord[] {
  return Array.from({ length: 100 }, (_, index) => {
    const annual = index < 40;
    const maize = annual ? index < 30 : index >= 95;
    return point(
      id,
      index + 1,
      annual ? "ANNUAL" : "NATURAL",
      maize ? "CROP" : "NATURAL",
      maize ? "MAIZE" : null,
    );
  });
}

const shares = (id: string, radar = false) => [
  {
    commune_id: id,
    crop_class: "ANNUAL",
    pixel_share: 0.35,
    method_version: CROP_AREA_METHOD_VERSION,
    radar,
  },
  {
    commune_id: id,
    crop_class: "NATURAL",
    pixel_share: 0.65,
    method_version: CROP_AREA_METHOD_VERSION,
    radar,
  },
];

describe("surfaces par sondage", () => {
  it("corrige la part vue par les agents par l'écart de la carte à sa part connue", () => {
    const survey = estimateSurvey(commune("A"), shares("A"));
    const maize = survey.communes[0]!.targets.find((entry) => entry.target === "MAIZE")!;
    expect(maize.method).toBe("regression");
    // Pente 0,75 - 5/60, part 0,35 + pente × (0,35 - 0,40).
    expect(maize.areaHa).toBeCloseTo(10_000 * (0.35 - (0.75 - 5 / 60) * 0.05), 6);
    expect(maize.gain!).toBeGreaterThan(1.5);
    expect(maize.mapHa).toBeCloseTo(3500, 6);
    // La classe « cultures annuelles » de la carte porte aussi soja, niébé et igname.
    expect(maize.mapShared).toBe(true);
    expect(
      survey.communes[0]!.targets.find((entry) => entry.target === "CULTIVATED")!.mapShared,
    ).toBe(false);
    expect(maize.marginHa).toBeGreaterThan(0);
  });

  it("réunit céréales, racines et tubercules pour le bilan alimentaire", () => {
    const points = commune("A").map((entry, index) =>
      index >= 95 ? { ...entry, crop_code: "YAM" } : entry,
    );
    const staples = estimateSurvey(points, shares("A")).communes[0]!.targets.find(
      (entry) => entry.target === "STAPLES",
    )!;
    // 30 points de maïs et 5 d'igname : tous comptent.
    expect(staples.positives).toBe(35);
    expect(staples.mapShared).toBe(true);
  });

  it("revient à l'estimateur direct quand le radar a corrigé la carte", () => {
    const survey = estimateSurvey(commune("A"), shares("A", true));
    const maize = survey.communes[0]!.targets.find((entry) => entry.target === "MAIZE")!;
    expect(maize.method).toBe("direct");
    expect(maize.areaHa).toBeCloseTo(3500, 6);
    expect(maize.gain).toBeNull();
  });

  it("écarte les points inaccessibles et donne le taux de réponse", () => {
    const points = commune("A").map((entry, index) =>
      index >= 90 ? { ...entry, land_cover: "INACCESSIBLE", crop_code: null } : entry,
    );
    const survey = estimateSurvey(points, shares("A"));
    expect(survey.communes[0]!.inaccessible).toBe(10);
    expect(survey.communes[0]!.responseRate).toBeCloseTo(0.9, 10);
    expect(survey.communes[0]!.targets[0]!.points).toBe(90);
  });

  it("additionne les communes, marges comprises", () => {
    const survey = estimateSurvey(
      [...commune("A"), ...commune("B")],
      [...shares("A"), ...shares("B")],
    );
    const one = survey.communes[0]!.targets.find((entry) => entry.target === "MAIZE")!;
    const both = survey.totals.find((entry) => entry.target === "MAIZE")!;
    expect(both.areaHa).toBeCloseTo(2 * one.areaHa, 6);
    expect(both.standardErrorHa).toBeCloseTo(Math.SQRT2 * one.standardErrorHa, 6);
    expect(both.points).toBe(200);
    expect(survey.drawn).toBe(200);
  });

  it("ne cite qu'un chiffre précis sur assez de points", () => {
    expect(citationStatus(0.08, 120, 40)).toBe("cite");
    expect(citationStatus(0.15, 120, 40)).toBe("indicative");
    expect(citationStatus(0.3, 120, 40)).toBe("do-not-cite");
    expect(citationStatus(0.05, 20, 10)).toBe("do-not-cite");
    expect(citationStatus(null, 120, 40)).toBe("do-not-cite");
    // Deux points de riz que la carte voit aussi : marge nulle, jamais citée.
    expect(citationStatus(0, 120, 2)).toBe("do-not-cite");
  });
});
