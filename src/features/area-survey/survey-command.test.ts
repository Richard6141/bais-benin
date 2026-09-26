import { describe, expect, it } from "vitest";
import { surveyPointObservePayload } from "@/modules/sync/commands";
import { buildSurveyCommand, distanceM } from "./survey-command";

// Constat d'un point d'enquête : ce que l'écran accepte, et une charge utile que le serveur lit.

const POINT = { id: "019284a0-0000-7000-8000-00000000d001", latitude: 9.2, longitude: 2.6 };
const NEAR = { lat: 9.2001, lng: 2.6 };
const FAR = { lat: 9.201, lng: 2.6 };

describe("constat d'un point d'enquête", () => {
  it("mesure la distance au point", () => {
    expect(distanceM(NEAR, { lat: 9.2, lng: 2.6 })).toBeCloseTo(11.1, 0);
    expect(distanceM(FAR, { lat: 9.2, lng: 2.6 })).toBeCloseTo(111.2, 0);
  });

  it("accepte une culture vue sur place, près du point", () => {
    const built = buildSurveyCommand({
      point: POINT,
      landCover: "CROP",
      cropCode: "MAIZE",
      reason: "",
      position: NEAR,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.gpsPoint).toEqual([2.6, 9.2001]);
    expect(built.payload.reason).toBeUndefined();
    expect(surveyPointObservePayload.safeParse(built.payload).success).toBe(true);
  });

  it("refuse un constat loin du point, sans position ou sans culture", () => {
    const base = { point: POINT, cropCode: "", reason: "" };
    const far = buildSurveyCommand({ ...base, landCover: "NATURAL", position: FAR });
    expect(far.ok ? "" : far.error).toMatch(/111 m du point/);
    const blind = buildSurveyCommand({ ...base, landCover: "NATURAL", position: null });
    expect(blind.ok).toBe(false);
    const noCrop = buildSurveyCommand({ ...base, landCover: "CROP", position: NEAR });
    expect(noCrop.ok ? "" : noCrop.error).toMatch(/culture/);
  });

  it("accepte un point inaccessible de loin, avec sa raison", () => {
    const built = buildSurveyCommand({
      point: POINT,
      landCover: "INACCESSIBLE",
      cropCode: "",
      reason: "Rivière en crue",
      position: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(surveyPointObservePayload.safeParse(built.payload).success).toBe(true);
    expect(
      buildSurveyCommand({
        ...{ point: POINT, cropCode: "", position: null },
        landCover: "INACCESSIBLE",
        reason: "",
      }).ok,
    ).toBe(false);
  });
});
