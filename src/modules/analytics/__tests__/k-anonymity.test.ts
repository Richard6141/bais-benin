import { describe, expect, it } from "vitest";
import { isSmallCell, maskSingle, maskSmallCells } from "../k-anonymity";

interface Row {
  code: string;
  farmCount: number;
  areaHa: number;
  verifiedShare: number;
}

const options = {
  count: (row: Row) => row.farmCount,
  fields: ["farmCount", "areaHa", "verifiedShare"] as const,
};

const row = (code: string, farmCount: number, areaHa = farmCount * 2): Row => ({
  code,
  farmCount,
  areaHa,
  verifiedShare: 1,
});

describe("masquage des petits effectifs", () => {
  it("masque de 1 à 4 exploitations, jamais 0 ni 5", () => {
    expect([0, 1, 4, 5].map((n) => isSmallCell(n))).toEqual([false, true, true, false]);
    const masked = maskSmallCells([row("a", 0), row("b", 4), row("c", 5)], options);
    expect(masked.map((r) => r.masked)).toEqual([false, true, false]);
    expect(masked[0]).toMatchObject({ farmCount: 0, areaHa: 0 });
    expect(masked[2]).toMatchObject({ farmCount: 5, areaHa: 10 });
  });

  it("efface toutes les mesures d'une ligne masquée, part vérifiée comprise", () => {
    // Une part à 100 % sur 3 exploitations dirait que les trois sont vérifiées.
    const [masked] = maskSmallCells([row("a", 3)], options);
    expect(masked).toEqual({
      code: "a",
      farmCount: null,
      areaHa: null,
      verifiedShare: null,
      masked: true,
    });
  });

  it("masque aussi la plus petite ligne visible quand le total est affiché", () => {
    const rows = [row("a", 40), row("b", 3), row("c", 12), row("d", 0), row("e", 7)];
    const masked = maskSmallCells(rows, { ...options, groupTotal: true });
    expect(masked.filter((r) => r.masked).map((r) => r.code)).toEqual(["b", "e"]);
    // La ligne à zéro n'est jamais choisie comme complément.
    expect(masked.find((r) => r.code === "d")?.masked).toBe(false);
  });

  it("n'ajoute rien quand deux lignes sont déjà masquées ou sans total", () => {
    const rows = [row("a", 40), row("b", 3), row("c", 2), row("d", 12)];
    expect(
      maskSmallCells(rows, { ...options, groupTotal: true }).filter((r) => r.masked),
    ).toHaveLength(2);
    expect(
      maskSmallCells([row("a", 40), row("b", 3)], options).filter((r) => r.masked),
    ).toHaveLength(1);
  });

  it("respecte un seuil différent", () => {
    expect(maskSingle(row("a", 7), { ...options, k: 10 }).masked).toBe(true);
  });
});
