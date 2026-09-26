import { describe, expect, it, vi } from "vitest";
import { CROP_CLASS_CODES } from "@/services/remote-sensing";
import { gridOrigin, gridSpacing, pointCode, pointMapClass, pointSquare } from "../frame";

vi.mock("@/database/client", () => ({ prisma: {} }));

// Tirage des points d'enquête (ADR-0033) : écart de la grille, origine reproductible, carré lu
// sur la carte et classe retenue.

describe("grille de tirage", () => {
  it("donne environ le nombre de points voulu", () => {
    // 7 200 km² pour 120 points : un point tous les 7,7 km environ.
    expect(gridSpacing(7_200e6, 120)).toBe(7746);
    expect(gridSpacing(1e6, 120)).toBe(500);
  });

  it("tire une origine reproductible, propre à la campagne et à la commune", () => {
    const first = gridOrigin("2026-2027", "BJ-BOR-008", 7746);
    expect(gridOrigin("2026-2027", "BJ-BOR-008", 7746)).toEqual(first);
    expect(gridOrigin("2027-2028", "BJ-BOR-008", 7746)).not.toEqual(first);
    expect(first.originXM).toBeGreaterThanOrEqual(0);
    expect(first.originXM).toBeLessThan(7746);
    expect(first.originYM).toBeLessThan(7746);
  });

  it("nomme chaque point par sa commune et son rang", () => {
    expect(pointCode("BJ-BOR-008", 7)).toBe("BJ-BOR-008-007");
  });
});

describe("classe de la carte au point", () => {
  it("lit un carré d'un pixel de 120 m autour du point", () => {
    const square = pointSquare(9, 2.5);
    const ring = square.coordinates[0]!;
    const heightM = (ring[2]![1]! - ring[0]![1]!) * 111_320;
    const widthM = (ring[1]![0]! - ring[0]![0]!) * 111_320 * Math.cos((9 * Math.PI) / 180);
    expect(heightM).toBeCloseTo(120, 6);
    expect(widthM).toBeCloseTo(120, 6);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("retient la classe la plus fréquente, non classé compris", () => {
    const pixels = new Array<number>(10).fill(0);
    pixels[CROP_CLASS_CODES.COTTON] = 3;
    pixels[CROP_CLASS_CODES.ANNUAL] = 1;
    expect(pointMapClass(pixels)).toBe("COTTON");
    const clouded = new Array<number>(10).fill(0);
    clouded[CROP_CLASS_CODES.UNCLASSIFIED] = 4;
    expect(pointMapClass(clouded)).toBe("UNCLASSIFIED");
    expect(pointMapClass(new Array<number>(10).fill(0))).toBe("UNCLASSIFIED");
  });
});
