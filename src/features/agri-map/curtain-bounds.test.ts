import { describe, expect, it } from "vitest";
import {
  CURTAIN_EDGE_MARGIN_PX,
  CURTAIN_PANEL_CLEARANCE_PX,
  clampCurtainPx,
  curtainPercentToPx,
  curtainPxToPercent,
} from "./curtain-bounds";

describe("bornes du rideau avant/après", () => {
  it("laisse une simple marge sur écran étroit", () => {
    expect(clampCurtainPx(-40, 400, false)).toBe(CURTAIN_EDGE_MARGIN_PX);
    expect(clampCurtainPx(200, 400, false)).toBe(200);
    expect(clampCurtainPx(1000, 400, false)).toBe(400 - CURTAIN_EDGE_MARGIN_PX);
  });

  it("écarte la poignée du panneau des réglages sur grand écran", () => {
    expect(clampCurtainPx(50, 1200, true)).toBe(CURTAIN_PANEL_CLEARANCE_PX);
    expect(clampCurtainPx(600, 1200, true)).toBe(600);
    expect(clampCurtainPx(1190, 1200, true)).toBe(1200 - CURTAIN_EDGE_MARGIN_PX);
  });

  it("retombe au centre si le panneau ne laisse aucune place utile", () => {
    expect(clampCurtainPx(300, 250, true)).toBe(125);
  });

  it("convertit dans les deux sens sans dérive", () => {
    const width = 900;
    for (const percent of [0, 12.5, 50, 87.5, 100]) {
      const px = curtainPercentToPx(percent, width);
      expect(curtainPxToPercent(px, width)).toBeCloseTo(percent, 5);
    }
  });

  it("retombe au centre plutôt que de diviser par zéro", () => {
    expect(curtainPxToPercent(50, 0)).toBe(50);
  });
});
