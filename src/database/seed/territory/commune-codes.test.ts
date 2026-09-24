import { describe, expect, it } from "vitest";
import { assignCommuneCodes, buildCommuneCode, sortKey } from "./commune-codes";

describe("codes des communes", () => {
  it("construit un code BJ-<DEP>-<NNN>", () => {
    expect(buildCommuneCode("BJ-DO", 2)).toBe("BJ-DON-002");
    expect(buildCommuneCode("BJ-OU", 9)).toBe("BJ-OUE-009");
  });

  it("refuse un département inconnu", () => {
    expect(() => buildCommuneCode("BJ-XX", 1)).toThrow(/Département inconnu/);
  });

  it("ignore accents et casse dans l'ordre alphabétique", () => {
    expect(sortKey("Sèmè-Kpodji")).toBe("seme-kpodji");
    const coded = assignCommuneCodes("BJ-DO", [
      { name: "Ouaké" },
      { name: "Bassila" },
      { name: "Djougou" },
      { name: "Copargo" },
    ]);
    expect(coded.map((c) => `${c.code} ${c.name}`)).toEqual([
      "BJ-DON-001 Bassila",
      "BJ-DON-002 Copargo",
      "BJ-DON-003 Djougou",
      "BJ-DON-004 Ouaké",
    ]);
  });
});
