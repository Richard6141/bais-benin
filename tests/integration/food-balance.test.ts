import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { getFoodBalance } from "@/modules/food-balance";
import { loadActor } from "@/modules/identity";

// Bilan alimentaire (ADR-0035) sur la vraie base : une commune hors enquête s'évalue avec les
// surfaces DSA importées, jamais avec le seul registre ; contrôle national FAOSTAT ; ministère seul.

const MINISTRY_PHONE = "+2290190000003";
const AGENT_PHONE = "+2290190000001";
const COMMUNE = "BJ-DON-003";
const REFERENCE = "test-integration-bilan";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

async function addStatistic(
  importedById: string,
  row: {
    sourceId: string;
    level: "NATIONAL" | "COMMUNE";
    territory: string;
    crop: string;
    campaign: string;
    metric: "AREA_HA" | "PRODUCTION_T";
    value: number;
  },
) {
  const crop = await prisma.crop.findUniqueOrThrow({ where: { code: row.crop } });
  await prisma.officialCropStatistic.create({
    data: {
      sourceId: row.sourceId,
      campaignCode: row.campaign,
      level: row.level,
      territoryCode: row.territory,
      cropId: crop.id,
      metric: row.metric,
      value: row.value,
      reference: REFERENCE,
      fileName: "test.csv",
      importedById,
    },
  });
}

describe("bilan alimentaire", () => {
  afterAll(async () => {
    await prisma.officialCropStatistic.deleteMany({ where: { reference: REFERENCE } });
    await prisma.$disconnect();
  });

  it("n'évalue une commune qu'avec des surfaces de toute la commune", async () => {
    const ministry = await actorForPhone(MINISTRY_PHONE);
    const before = await getFoodBalance(ministry.actor);
    expect(before!.communes).toHaveLength(
      await prisma.commune.count({ where: { archivedAt: null } }),
    );
    // Le registre seul ne fait jamais de bilan : sans enquête ni statistique, non évaluée.
    const alone = before!.communes.find((entry) => entry.code === COMMUNE)!;
    expect(alone.status).toBe("not-evaluated");
    for (const entry of before!.communes.filter((item) => item.status !== "not-evaluated")) {
      expect(
        entry.crops.every(
          (crop) => crop.source.kind === "survey" || crop.source.kind === "official",
        ),
      ).toBe(true);
      expect(entry.coverage!.low).toBeLessThanOrEqual(entry.coverage!.high);
    }

    await addStatistic(ministry.id, {
      sourceId: "MAEP_DSA",
      level: "COMMUNE",
      territory: COMMUNE,
      crop: "MAIZE",
      campaign: "2025-2026",
      metric: "AREA_HA",
      value: 20_000,
    });
    await addStatistic(ministry.id, {
      sourceId: "MAEP_DSA",
      level: "COMMUNE",
      territory: COMMUNE,
      crop: "YAM",
      campaign: "2025-2026",
      metric: "AREA_HA",
      value: 8_000,
    });
    // Sans manioc, pas de bilan : maïs, igname et manioc sont exigés.
    expect(
      (await getFoodBalance(ministry.actor))!.communes.find((entry) => entry.code === COMMUNE)!
        .status,
    ).toBe("not-evaluated");
    await addStatistic(ministry.id, {
      sourceId: "MAEP_DSA",
      level: "COMMUNE",
      territory: COMMUNE,
      crop: "CASSAVA",
      campaign: "2025-2026",
      metric: "AREA_HA",
      value: 6_000,
    });
    const after = await getFoodBalance(ministry.actor);
    const official = after!.communes.find((entry) => entry.code === COMMUNE)!;
    expect(official.status).not.toBe("not-evaluated");
    expect(official.crops.map((crop) => crop.cropCode).sort()).toEqual(["CASSAVA", "MAIZE", "YAM"]);
    expect(official.crops[0]!.source).toMatchObject({
      kind: "official",
      campaignCode: "2025-2026",
    });
    expect(official.missingCrops).toContain("SORGHUM");
    expect(official.coverage!.central).toBeGreaterThan(0);
  });

  it("donne le contrôle national quand FAOSTAT est importé, et rien à un agent", async () => {
    const ministry = await actorForPhone(MINISTRY_PHONE);
    const national: Array<[string, number, number]> = [
      ["MAIZE", 1_700_000, 2_000_000],
      ["SORGHUM", 150_000, 150_000],
      ["RICE", 90_000, 450_000],
      ["YAM", 220_000, 3_200_000],
      ["CASSAVA", 300_000, 4_000_000],
    ];
    for (const [crop, area, production] of national) {
      await addStatistic(ministry.id, {
        sourceId: "FAOSTAT",
        level: "NATIONAL",
        territory: "BJ",
        crop,
        campaign: "2099",
        metric: "AREA_HA",
        value: area,
      });
      await addStatistic(ministry.id, {
        sourceId: "FAOSTAT",
        level: "NATIONAL",
        territory: "BJ",
        crop,
        campaign: "2099",
        metric: "PRODUCTION_T",
        value: production,
      });
    }
    const view = await getFoodBalance(ministry.actor);
    expect(view!.nationalCheck?.year).toBe("2099");
    expect(view!.nationalCheck!.coverage).toBeGreaterThan(0.5);
    expect(view!.nationalCheck!.coverage).toBeLessThan(3);

    expect(await getFoodBalance((await actorForPhone(AGENT_PHONE)).actor)).toBeNull();
  });
});
