import { describe, expect, it, vi } from "vitest";
import type { SownAreaRow, YieldHistoryRow } from "@/database/sql/forecast.sql";

vi.mock("@/database/client", () => ({ prisma: {} }));

const { buildForecastRows, changePct, confidenceOf, estimate, indexYields, yieldReference } =
  await import("../forecast");

const history = (
  level: YieldHistoryRow["level"],
  over: Partial<YieldHistoryRow>,
): YieldHistoryRow => ({
  crop_code: "MAIZE",
  level,
  commune_id: null,
  departement_code: null,
  harvests: 10,
  kg: 20_000,
  area_ha: 10,
  p25: 1500,
  p75: 2500,
  ...over,
});

const area = (over: Partial<SownAreaRow> = {}): SownAreaRow => ({
  campaign_code: "2026-2027",
  crop_code: "MAIZE",
  crop_name: "Maïs",
  typical_yield_t_per_ha: 1.35,
  commune_id: "c1",
  commune_code: "BJ-DON-003",
  commune_name: "Djougou",
  departement_code: "BJ-DO",
  departement_name: "Donga",
  parcels: 4,
  area_ha: 10,
  ...over,
});

describe("rendement de référence", () => {
  const index = indexYields([
    history("commune", { commune_id: "c1", departement_code: "BJ-DO", kg: 20_000 }),
    history("commune", { commune_id: "c2", departement_code: "BJ-DO", harvests: 2, kg: 99_000 }),
    history("departement", { departement_code: "BJ-DO", kg: 15_000 }),
    history("national", { kg: 12_000 }),
  ]);

  it("prend la commune quand elle a assez de récoltes", () => {
    expect(yieldReference(index, area())).toMatchObject({ basis: "commune", meanTPerHa: 2 });
  });

  it("remonte au département quand la commune a trop peu de récoltes", () => {
    expect(yieldReference(index, area({ commune_id: "c2" }))).toMatchObject({
      basis: "departement",
      meanTPerHa: 1.5,
    });
  });

  it("remonte au pays, puis au rendement type", () => {
    expect(yieldReference(index, area({ commune_id: "c9", departement_code: "BJ-ZO" })).basis).toBe(
      "national",
    );
    expect(
      yieldReference(indexYields([]), area({ commune_id: "c9", departement_code: "BJ-ZO" })),
    ).toMatchObject({ basis: "typical", meanTPerHa: 1.35 });
  });
});

describe("estimation", () => {
  const index = indexYields([history("commune", { commune_id: "c1", departement_code: "BJ-DO" })]);

  it("multiplie la surface par le rendement, fourchette aux quartiles", () => {
    const e = estimate([area({ area_ha: 10 })], index);
    expect(e.productionT).toBeCloseTo(20, 6);
    expect(e.lowT).toBeCloseTo(15, 6);
    expect(e.highT).toBeCloseTo(25, 6);
    expect(confidenceOf(e)).toBe("HIGH");
  });

  it("calcule la variation et signale un déficit de 15 % ou plus", () => {
    expect(changePct(85, 100)).toBe(-15);
    expect(changePct(100, null)).toBeNull();
    const rows = buildForecastRows({
      current: [area({ area_ha: 8 })],
      previous: [area({ campaign_code: "2025-2026", area_ha: 10 })],
      historyIndex: index,
      previousIndex: index,
      satellite: new Map([["MAIZE", { checked: 20, toVerify: 5 }]]),
      groupBy: "crop",
    });
    expect(rows[0]).toMatchObject({ code: "MAIZE", changePct: -20, deficit: true });
    expect(rows[0]!.satelliteFlagShare).toBeCloseTo(0.25, 6);
  });
});
