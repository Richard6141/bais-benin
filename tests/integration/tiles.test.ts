import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { communeTile, departementTile, farmPointsTile } from "@/database/sql/tiles.sql";
import { lonLatToTile, tileToBBox } from "@/lib/geo/tile-math";

// Tuiles de référence, calculées plutôt que recopiées :
// - au zoom 6, la tuile 32/30 couvre lon 0 à 5,6° et lat 5,6 à 11,2°, soit le sud et le centre
//   du Bénin (Cotonou, Parakou) ;
// - au zoom 5, la tuile 16/15 couvre lon 0 à 11,25° et lat 0 à 11,2° ;
// - la tuile 6/0/0 est dans l'Arctique, au large de l'Alaska : aucune commune.
const COTONOU = { lon: 2.42, lat: 6.37 };
const PARAKOU = { lon: 2.63, lat: 9.34 };

function containsLayerName(tile: Buffer, layer: string): boolean {
  return tile.includes(Buffer.from(layer, "utf8"));
}

describe("tuiles vectorielles", () => {
  beforeAll(async () => {
    await seedReferenceData();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("la tuile 6/32/30 contient bien Cotonou et Parakou", () => {
    expect(lonLatToTile(COTONOU.lon, COTONOU.lat, 6)).toEqual({ x: 32, y: 30 });
    expect(lonLatToTile(PARAKOU.lon, PARAKOU.lat, 6)).toEqual({ x: 32, y: 30 });
    const [minLon, minLat, maxLon, maxLat] = tileToBBox(6, 32, 30);
    expect(minLon).toBe(0);
    expect(maxLon).toBeCloseTo(5.625, 6);
    expect(minLat).toBeCloseTo(5.616, 2);
    expect(maxLat).toBeCloseTo(11.178, 2);
  });

  it("produit une tuile de communes non vide sur le sud et le centre du Bénin", async () => {
    const tile = await communeTile(6, 32, 30);
    expect(tile).not.toBeNull();
    expect(tile?.byteLength ?? 0).toBeGreaterThan(1024);
    expect(containsLayerName(tile as Buffer, "communes")).toBe(true);
    // Les attributs sont encodés en clair dans la table des clés et des valeurs de la couche.
    expect(containsLayerName(tile as Buffer, "departement_code")).toBe(true);
    expect(containsLayerName(tile as Buffer, "Cotonou")).toBe(true);
  });

  it("renvoie null pour une tuile sans commune", async () => {
    expect(await communeTile(6, 0, 0)).toBeNull();
    // Au large, dans le golfe de Guinée : lon -5,6 à 0°, lat 0 à 5,6°.
    expect(await communeTile(6, 31, 31)).toBeNull();
  });

  it("produit une tuile de départements non vide au zoom 5", async () => {
    const tile = await departementTile(5, 16, 15);
    expect(tile).not.toBeNull();
    expect(tile?.byteLength ?? 0).toBeGreaterThan(256);
    expect(containsLayerName(tile as Buffer, "departements")).toBe(true);
    expect(containsLayerName(tile as Buffer, "BJ-DO")).toBe(true);
    expect(await departementTile(5, 0, 0)).toBeNull();
  });

  it("allège les tuiles à faible zoom par simplification", async () => {
    const coarse = await communeTile(4, 8, 7);
    const fine = await communeTile(9, 259, 246);
    expect(coarse).not.toBeNull();
    expect(fine).not.toBeNull();
    // Une tuile de zoom 4 couvre tout le pays avec 77 communes très simplifiées ; une tuile de
    // zoom 9 n'en contient que quelques-unes mais avec bien plus de sommets chacune.
    expect((coarse as Buffer).byteLength).toBeLessThan(200_000);
  });

  it("sert les points d'exploitations autour de Djougou et rien en mer", async () => {
    // Le registre synthétique est chargé par le seed : la tuile de zoom 8 qui contient
    // Djougou (1,67° E, 9,70° N) doit porter des points, la tuile océanique aucun.
    const djougou = lonLatToTile(1.67, 9.7, 8);
    const tile = await farmPointsTile(8, djougou.x, djougou.y);
    expect(tile).not.toBeNull();
    expect(Buffer.from(tile as Buffer).includes("farms")).toBe(true);
    await expect(farmPointsTile(6, 0, 0)).resolves.toBeNull();
  });

  it("refuse une tuile hors grille", async () => {
    await expect(communeTile(3, 8, 0)).rejects.toThrow(RangeError);
    await expect(farmPointsTile(-1, 0, 0)).rejects.toThrow(RangeError);
  });
});
