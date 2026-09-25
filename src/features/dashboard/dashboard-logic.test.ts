import { describe, expect, it } from "vitest";
import {
  MASKED_LABEL,
  defaultCampaign,
  describeFilters,
  displayCell,
  filtersQuery,
  formatHectares,
  formatTonnesFromKg,
  isMasked,
  numeric,
  parseDashboardFilters,
  previousCampaign,
  ratioPhrase,
  sortRows,
  sortValueOf,
  variationPercent,
  yieldGapPercent,
  type Cell,
} from "./dashboard-logic";

// Intl insère des espaces fines insécables : on les normalise pour comparer.
const plain = (text: string) => text.replace(/[  ]/g, " ");

const campaigns = [
  { code: "2023-2024", startYear: 2023, status: "CLOSED" as const },
  { code: "2025-2026", startYear: 2025, status: "OPEN" as const },
  { code: "2024-2025", startYear: 2024, status: "CLOSED" as const },
  { code: "2026-2027", startYear: 2026, status: "PLANNED" as const },
];

describe("filtres du tableau de bord", () => {
  it("garde les valeurs bien formées et ignore les autres", () => {
    expect(
      parseDashboardFilters({
        campaignCode: "2025-2026",
        cropCode: "MAIZE",
        departementCode: "BJ-DO",
        verificationStatus: "FIELD_VERIFIED",
      }),
    ).toEqual({
      campaignCode: "2025-2026",
      cropCode: "MAIZE",
      departementCode: "BJ-DO",
      verificationStatus: "FIELD_VERIFIED",
    });
    expect(
      parseDashboardFilters({
        campaignCode: "2025",
        cropCode: "maïs",
        departementCode: ["BJ-XX1", "BJ-DO"],
        verificationStatus: "OK",
      }),
    ).toEqual({
      campaignCode: undefined,
      cropCode: undefined,
      departementCode: undefined,
      verificationStatus: undefined,
    });
  });

  it("écrit la requête dans un ordre stable et applique les modifications", () => {
    const filters = { cropCode: "MAIZE", campaignCode: "2025-2026" };
    expect(filtersQuery(filters)).toBe("campaignCode=2025-2026&cropCode=MAIZE");
    expect(filtersQuery(filters, { cropCode: undefined, departementCode: "BJ-DO" })).toBe(
      "campaignCode=2025-2026&departementCode=BJ-DO",
    );
  });

  it("choisit la campagne ouverte, puis sa précédente close", () => {
    expect(defaultCampaign(campaigns)).toBe("2025-2026");
    expect(defaultCampaign(campaigns.filter((c) => c.status !== "OPEN"))).toBe("2024-2025");
    expect(defaultCampaign([])).toBeUndefined();
    expect(previousCampaign(campaigns, "2025-2026")).toBe("2024-2025");
    expect(previousCampaign(campaigns, "2023-2024")).toBeUndefined();
  });

  it("résume les filtres en clair", () => {
    const names = {
      crops: new Map([["MAIZE", "Maïs"]]),
      departements: new Map([["BJ-DO", "Donga"]]),
    };
    expect(describeFilters({}, names)).toBe(
      "Toutes les campagnes · Toutes cultures · Tout le pays",
    );
    expect(
      describeFilters(
        { campaignCode: "2025-2026", cropCode: "MAIZE", departementCode: "BJ-DO" },
        names,
      ),
    ).toBe("Campagne 2025-2026 · Maïs · Donga");
  });
});

describe("secret statistique et formats", () => {
  const masked: Cell = { masked: true };

  it("n'affiche jamais une valeur masquée et ne la compte pas", () => {
    expect(isMasked(masked)).toBe(true);
    expect(numeric(masked)).toBeNull();
    expect(displayCell(masked, String)).toBe(MASKED_LABEL);
    expect(displayCell(null, String)).toBe("—");
    expect(displayCell(12, (v) => `${v} ha`)).toBe("12 ha");
  });

  it("formate hectares et tonnes selon l'ordre de grandeur", () => {
    expect(plain(formatHectares(12.34))).toBe("12,3 ha");
    expect(plain(formatHectares(1234.5))).toBe("1 235 ha");
    expect(plain(formatTonnesFromKg(8_500))).toBe("8,5 t");
    expect(plain(formatTonnesFromKg(1_250_000))).toBe("1 250 t");
  });

  it("ne calcule une variation que si les deux campagnes ont une donnée", () => {
    expect(variationPercent(120, 100)).toBeCloseTo(20);
    expect(variationPercent(80, 100)).toBeCloseTo(-20);
    expect(variationPercent(120, null)).toBeNull();
    expect(variationPercent(120, 0)).toBeNull();
    expect(variationPercent(masked, 100)).toBeNull();
    expect(yieldGapPercent(1.5, 2)).toBeCloseTo(-25);
    expect(yieldGapPercent(1.5, null)).toBeNull();
  });

  it("compare une commune à une référence en « fois »", () => {
    expect(ratioPhrase(140, 100, "la moyenne départementale")).toBe(
      "1,4 fois la moyenne départementale",
    );
    expect(ratioPhrase(140, 0, "la moyenne")).toBeNull();
  });
});

describe("tri des tableaux", () => {
  const rows = [
    { name: "Djougou", farms: 120 as Cell },
    { name: "Bassila", farms: { masked: true } as Cell },
    { name: "Copargo", farms: 45 as Cell },
    { name: "Ouaké", farms: null as Cell },
    { name: "Aplahoué", farms: 45 as Cell },
  ];

  it("laisse les valeurs masquées et absentes en bas dans les deux sens", () => {
    const desc = sortRows(rows, (r) => sortValueOf(r.farms), "descending").map((r) => r.name);
    expect(desc).toEqual(["Djougou", "Copargo", "Aplahoué", "Bassila", "Ouaké"]);
    const asc = sortRows(rows, (r) => sortValueOf(r.farms), "ascending").map((r) => r.name);
    expect(asc).toEqual(["Copargo", "Aplahoué", "Djougou", "Bassila", "Ouaké"]);
  });

  it("trie les noms selon l'ordre français, accents compris", () => {
    const asc = sortRows(rows, (r) => r.name, "ascending").map((r) => r.name);
    expect(asc).toEqual(["Aplahoué", "Bassila", "Copargo", "Djougou", "Ouaké"]);
  });
});
