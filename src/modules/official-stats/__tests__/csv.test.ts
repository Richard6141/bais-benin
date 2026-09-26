import { describe, expect, it } from "vitest";
import { normalize, parseNumber, parseOfficialCsv, type CsvLookups } from "../csv";

// Fichier de statistiques officielles (ADR-0034) : ce qui est lu, et chaque refus avec sa ligne.

const lookups: CsvLookups = {
  crops: new Map([
    ["maize", "MAIZE"],
    ["mais", "MAIZE"],
    ["riz", "RICE"],
    ["rice", "RICE"],
    ["coton", "COTTON"],
    ["niebe", "COWPEA"],
  ]),
  territories: new Map([
    ["BJ", "NATIONAL"],
    ["BJ-BO", "DEPARTEMENT"],
    ["BJ-BOR-008", "COMMUNE"],
  ]),
};

describe("statistiques officielles en CSV", () => {
  it("lit un fichier de la DSA à la française", () => {
    const text = [
      "Source;Campagne;Territoire;Culture;Indicateur;Valeur;Référence",
      'DSA;2024-2025;BJ-BOR-008;Maïs;superficie_ha;"12 345,5";Annuaire DSA 2025',
      "DSA;2024-2025;bj-bor-008;riz paddy;production_t;3 210;Annuaire DSA 2025",
      "DSA;2024-2025;BJ-BO;Coton graine;rendement_t_ha;1,1;",
    ].join("\r\n");
    const result = parseOfficialCsv(text, lookups);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toEqual({
      line: 2,
      sourceId: "MAEP_DSA",
      campaignCode: "2024-2025",
      territoryCode: "BJ-BOR-008",
      level: "COMMUNE",
      cropCode: "MAIZE",
      metric: "AREA_HA",
      value: 12345.5,
      reference: "Annuaire DSA 2025",
    });
    expect(result.rows[1]).toMatchObject({ cropCode: "RICE", metric: "PRODUCTION_T", value: 3210 });
    expect(result.rows[2]).toMatchObject({ level: "DEPARTEMENT", value: 1.1, reference: null });
  });

  it("lit un extrait FAOSTAT à l'anglaise", () => {
    const text =
      "source,campagne,territoire,culture,indicateur,valeur\nFAOSTAT,2023,BJ,MAIZE,superficie_ha,1234567.8\n";
    const result = parseOfficialCsv(text, lookups);
    expect(result.ok && result.rows[0]).toMatchObject({
      sourceId: "FAOSTAT",
      level: "NATIONAL",
      value: 1234567.8,
    });
  });

  it("refuse tout le fichier et dit chaque erreur avec sa ligne", () => {
    const text = [
      "source;campagne;territoire;culture;indicateur;valeur",
      "DSA;2024-2026;BJ-XX-999;Mangue;surface;abc",
      "DSA;2024-2025;BJ;Maïs;superficie_ha;90 000 000",
      "DSA;2024-2025;BJ;Niébé;superficie_ha;150 000",
      "DSA;2024-2025;BJ;niebe;superficie_ha;150 000",
    ].join("\n");
    const result = parseOfficialCsv(text, lookups);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 5]);
    expect(result.errors[0]!.message).toMatch(
      /campagne.*territoire inconnu.*culture inconnue.*non numérique/,
    );
    expect(result.errors[1]!.message).toMatch(/invraisemblable/);
    expect(result.errors[2]!.message).toMatch(/ligne 4/);
  });

  it("dit les colonnes manquantes et refuse un fichier vide", () => {
    const missing = parseOfficialCsv("source;culture\nDSA;Maïs", lookups);
    expect(!missing.ok && missing.errors[0]!.message).toMatch(
      /campagne, territoire, indicateur, valeur/,
    );
    const empty = parseOfficialCsv(
      "source;campagne;territoire;culture;indicateur;valeur\n",
      lookups,
    );
    expect(empty.ok).toBe(false);
  });

  it("normalise noms et nombres", () => {
    expect(normalize("  Palmier à  huile ")).toBe("palmier a huile");
    expect(parseNumber("1 234,50")).toBe(1234.5);
    expect(parseNumber("-5")).toBeNull();
    expect(parseNumber("1.234,5")).toBeNull();
  });
});
