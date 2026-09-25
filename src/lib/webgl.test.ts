import { afterEach, describe, expect, it, vi } from "vitest";
import { hasWebGL2 } from "./webgl";

describe("hasWebGL2", () => {
  afterEach(() => vi.restoreAllMocks());

  it("dit non quand le navigateur ne fournit pas de contexte WebGL2", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(hasWebGL2()).toBe(false);
  });

  it("dit non quand la création du contexte lève une erreur", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("GPU indisponible");
    });
    expect(hasWebGL2()).toBe(false);
  });

  it("dit oui quand un contexte WebGL2 est rendu", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as unknown as RenderingContext,
    );
    expect(hasWebGL2()).toBe(true);
  });
});
