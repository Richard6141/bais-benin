import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CROP_CODES, CROP_GLYPH_LABELS, CropGlyph } from "./crop-glyph";

describe("CropGlyph", () => {
  it("couvre les 21 cultures du référentiel", () => {
    expect(CROP_CODES).toHaveLength(21);
  });

  it.each(CROP_CODES)("rend %s comme une image nommée en français", (code) => {
    render(<CropGlyph code={code} />);
    const svg = screen.getByRole("img");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg).toHaveAttribute("aria-label", CROP_GLYPH_LABELS[code]);
    expect(CROP_GLYPH_LABELS[code]).not.toBe("");
    expect(svg.querySelector("path, circle, ellipse, rect")).not.toBeNull();
  });

  it("applique la taille de 24 px par défaut", () => {
    render(<CropGlyph code="MAIZE" />);
    expect(screen.getByRole("img")).toHaveClass("size-6");
  });

  it("applique la taille de 48 px pour l'espace agriculteur", () => {
    render(<CropGlyph code="YAM" size={48} />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveClass("size-12");
    expect(svg).not.toHaveClass("size-6");
  });

  it("transmet la classe fournie sans perdre le trait monochrome", () => {
    render(<CropGlyph code="COTTON" className="text-primary" />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveClass("text-primary");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("fill", "none");
  });

  it("laisse le titre remplacer le nom français", () => {
    render(<CropGlyph code="RICE" title="Riz de bas-fond" />);
    expect(screen.getByRole("img", { name: "Riz de bas-fond" })).toBeInTheDocument();
  });
});
