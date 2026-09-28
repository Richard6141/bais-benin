import { describe, expect, it } from "vitest";
import { invalidContourMessage } from "./geometry";

describe("motif de refus d'un contour", () => {
  it("traduit les points confondus renvoyés par PostGIS", () => {
    const message = invalidContourMessage("Too few points in geometry component[2.41828 6.38278]");
    expect(message).toContain("au même endroit");
    expect(message).not.toContain("Too few");
  });

  it("traduit un contour qui se croise", () => {
    expect(invalidContourMessage("Self-intersection[1.6 9]")).toContain("se croisent");
  });

  it("donne un motif général sinon, sans texte anglais", () => {
    expect(invalidContourMessage(null)).toMatch(/^Contour invalide : /);
    expect(invalidContourMessage("Hole lies outside shell[1 2]")).not.toContain("Hole");
  });
});
