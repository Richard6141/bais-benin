import { describe, expect, it } from "vitest";
import { cropGroupLabel, cropGroupOf, singleCropOf } from "../crop-groups";
import {
  FEATURE_NAMES,
  MISSING,
  featureVector,
  fillDecades,
  mergeSeries,
  parcelFeatures,
  signatureWindowStart,
  type S1Step,
  type S2Decade,
} from "../parcel-features";

// Variables d'une parcelle pour le modèle de culture (ADR-0030) : séries régulières, trous
// comblés, mois pas encore lus marqués comme tels.

const WINDOW = new Date("2026-01-01T00:00:00Z");
const DAY = 86_400_000;

function decade(
  index: number,
  ndvi: number | null,
  ndmi: number | null = 0.1,
  valid = 1,
): S2Decade {
  return { from: new Date(WINDOW.getTime() + index * 10 * DAY).toISOString(), ndvi, ndmi, valid };
}

describe("séries par décade", () => {
  it("comble un trou nuageux par interpolation entre les décades vues", () => {
    const filled = fillDecades(
      [decade(0, 0.2), decade(1, null, null, 0), decade(2, 0.6)],
      "ndvi",
      WINDOW,
      new Date(WINDOW.getTime() + 25 * DAY),
    );
    expect(filled).toHaveLength(3);
    expect(filled[1]).toBeCloseTo(0.4, 5);
  });

  it("ignore une décade à moins de la moitié de pixels vus", () => {
    const filled = fillDecades(
      [decade(0, 0.2), decade(1, 0.9, 0.1, 0.3), decade(2, 0.2)],
      "ndvi",
      WINDOW,
      new Date(WINDOW.getTime() + 25 * DAY),
    );
    expect(filled[1]).toBeCloseTo(0.2, 5);
  });

  it("complète une série connue par le nouveau morceau, sans doublon", () => {
    const known = [decade(0, 0.2), decade(1, 0.25), decade(2, 0.3)];
    const fresh = [decade(2, 0.35), decade(3, 0.5)];
    const merged = mergeSeries(known, fresh, new Date(fresh[0]!.from));
    expect(merged.map((entry) => entry.ndvi)).toEqual([0.2, 0.25, 0.35, 0.5]);
  });
});

describe("variables du modèle", () => {
  const observedUntil = new Date("2026-09-15T00:00:00Z");
  // Maïs du nord : sol nu jusqu'en juin, pic en août.
  const s2: S2Decade[] = Array.from({ length: 26 }, (_, index) => {
    const day = index * 10;
    const ndvi = day < 160 ? 0.2 : day < 220 ? 0.2 + (day - 160) * 0.008 : 0.68;
    return decade(index, ndvi, ndvi - 0.2);
  });
  const s1: S1Step[] = Array.from({ length: 21 }, (_, index) => ({
    from: new Date(WINDOW.getTime() + index * 12 * DAY).toISOString(),
    vh: -20 + index * 0.3,
    vv: -14 + index * 0.3,
  }));
  const features = parcelFeatures({ windowFrom: WINDOW, observedUntil, s2, s1 });

  it("donne toutes les variables, dans l'ordre attendu par le modèle", () => {
    expect(Object.keys(features).sort()).toEqual([...FEATURE_NAMES].sort());
    expect(featureVector(features)).toHaveLength(FEATURE_NAMES.length);
  });

  it("marque les mois pas encore lus, et lit la montée et le pic", () => {
    expect(features.ndvi_m08).toBeGreaterThan(0.6);
    expect(features.ndvi_m11).toBe(MISSING);
    expect(features.ndvi_m14).toBe(MISSING);
    expect(features.ndvi_max).toBeCloseTo(0.68, 2);
    expect(features.greenup_rate).toBeGreaterThan(0.2);
    expect(features.vh_minus_vv).toBeCloseTo(-6, 1);
  });

  it("part du 1er janvier de l'année de campagne", () => {
    expect(signatureWindowStart(new Date("2026-04-01T00:00:00Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("classes du modèle", () => {
  it("regroupe les cultures que le satellite ne sépare pas", () => {
    expect(cropGroupOf("SORGHUM")).toBe("SORGHUM_MILLET");
    expect(cropGroupOf("MILLET")).toBe("SORGHUM_MILLET");
    expect(cropGroupOf("CASHEW")).toBe("PERENNIAL");
    expect(cropGroupOf("INCONNUE")).toBeNull();
    expect(singleCropOf("MAIZE")).toBe("MAIZE");
    expect(singleCropOf("ROOTS")).toBeNull();
  });

  it("garde des libellés courts, sans point médian, points de suspension ni tiret long", () => {
    for (const group of ["MAIZE", "LEGUMES_OILSEEDS", "ROOTS", "PERENNIAL"]) {
      expect(cropGroupLabel(group)).not.toMatch(/[·…—]/);
    }
  });
});
