import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import { getOfficialReconciliation, importOfficialStatistics } from "@/modules/official-stats";

// Statistiques officielles (ADR-0034) sur la vraie base : import tout ou rien par le ministère,
// remplacement d'une ligne réimportée, rapprochement avec le registre et le sondage.

const MINISTRY_PHONE = "+2290190000003";
const AGENT_PHONE = "+2290190000001";
const COMMUNE = "BJ-BOR-008";
const REFERENCE = "test-integration";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

const csv = (maize: string) =>
  [
    "source;campagne;territoire;culture;indicateur;valeur;reference",
    `DSA;2025-2026;${COMMUNE};Maïs;superficie_ha;${maize};${REFERENCE}`,
    `DSA;2025-2026;${COMMUNE};Sorgho;superficie_ha;30 000;${REFERENCE}`,
    `DSA;2025-2026;${COMMUNE};Mil;superficie_ha;5 000;${REFERENCE}`,
    `DSA;2025-2026;${COMMUNE};Maïs;rendement_t_ha;1,4;${REFERENCE}`,
  ].join("\n");

describe("statistiques officielles", () => {
  afterAll(async () => {
    await prisma.officialCropStatistic.deleteMany({ where: { reference: REFERENCE } });
    await prisma.$disconnect();
  });

  it("réserve l'import au ministère, et n'écrit rien d'un fichier fautif", async () => {
    const agent = await importOfficialStatistics(await actorForPhone(AGENT_PHONE), {
      name: "dsa.csv",
      text: csv("80 000"),
    });
    expect(agent.ok).toBe(false);
    const ministry = await actorForPhone(MINISTRY_PHONE);
    const broken = await importOfficialStatistics(ministry, {
      name: "dsa.csv",
      text: `${csv("80 000")}\nDSA;2025-2026;${COMMUNE};Mangue;superficie_ha;10;${REFERENCE}`,
    });
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.errors[0]!.line).toBe(6);
    expect(await prisma.officialCropStatistic.count({ where: { reference: REFERENCE } })).toBe(0);
  });

  it("importe, remplace à la réimportation et rapproche du registre et du sondage", async () => {
    const ministry = await actorForPhone(MINISTRY_PHONE);
    expect(
      await importOfficialStatistics(ministry, { name: "dsa.csv", text: csv("80 000") }),
    ).toEqual({
      ok: true,
      imported: 4,
      sources: ["MAEP_DSA"],
      campaigns: ["2025-2026"],
    });
    await importOfficialStatistics(ministry, { name: "dsa-corrige.csv", text: csv("90 000") });
    const maize = await prisma.officialCropStatistic.findMany({
      where: { reference: REFERENCE, crop: { code: "MAIZE" }, metric: "AREA_HA" },
      select: { value: true, fileName: true },
    });
    expect(maize.map((row) => [Number(row.value), row.fileName])).toEqual([
      [90_000, "dsa-corrige.csv"],
    ]);

    const view = await getOfficialReconciliation(ministry);
    const row = view!.rows.find(
      (entry) => entry.territoryCode === COMMUNE && entry.cropCode === "MAIZE",
    )!;
    expect(row.officialHa).toBe(90_000);
    expect(row.sameCampaign).toBe(false);
    expect(row.registryShare! * 90_000).toBeCloseTo(row.registryHa, 0);
    const sorghum = view!.rows.find(
      (entry) => entry.territoryCode === COMMUNE && entry.cropCode === "SORGHUM",
    )!;
    // Sorgho et mil forment un seul groupe pour le sondage.
    if (sorghum.survey) expect(sorghum.survey.officialGroupHa).toBe(35_000);
    expect(view!.imports.some((entry) => entry.sourceId === "MAEP_DSA")).toBe(true);

    expect(await getOfficialReconciliation(await actorForPhone(AGENT_PHONE))).toBeNull();
  });
});
