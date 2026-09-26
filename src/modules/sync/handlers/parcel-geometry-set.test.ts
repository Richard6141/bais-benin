import { describe, expect, it } from "vitest";
import { geometryReliability } from "./parcel-geometry-set";

describe("fiabilité d'un contour de parcelle", () => {
  it("réserve FIELD_VERIFIED à la marche GPS d'un agent sur place", () => {
    expect(geometryReliability("GPS_WALK", "AGENT_AGRICULTURE")).toBe("FIELD_VERIFIED");
  });

  it("donne AGENT_VERIFIED, jamais FIELD_VERIFIED, au contour satellite validé par l'agent", () => {
    expect(geometryReliability("SATELLITE_ASSISTED", "AGENT_AGRICULTURE")).toBe("AGENT_VERIFIED");
  });

  it("laisse DECLARED au dessin sur carte et à tout autre rôle", () => {
    expect(geometryReliability("MAP_DRAW", "AGENT_AGRICULTURE")).toBe("DECLARED");
    expect(geometryReliability("SATELLITE_ASSISTED", "FARMER")).toBe("DECLARED");
    expect(geometryReliability("GPS_WALK", "FARMER")).toBe("DECLARED");
  });
});
