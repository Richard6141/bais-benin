import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { insertFireDetections } from "@/database/sql/fires.sql";
import { getFirePreventionStatus, preventionReference, queueFirePrevention } from "@/modules/fires";

// Conseil de la saison des feux (ADR-0038 §3, ADR-0039) sur la vraie base : rien tant que
// l'interrupteur est coupé ni hors saison ; en saison, un message par producteur consentant des
// communes les plus touchées, et rien de plus si la tâche repasse la même semaine. Saison passée
// absente : la saison en cours, puis la dernière saison complète en base dès qu'elle est chargée.

const since = new Date(Date.now() - 60_000);
/** Lundi 7 décembre 2026, 8 h à Porto-Novo. */
const MONDAY = new Date("2026-12-07T07:00:00Z");
let communeId: string;
let parcel: { lon: number; lat: number };

/** `count` détections autour de la parcelle, à partir de `start`, un jour d'écart chacune. */
function detections(start: Date, count: number, key: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    detectedAt: new Date(start.getTime() + (index % 28) * 86_400_000),
    latitude: parcel.lat + ((index % 10) - 5) * 0.002,
    longitude: parcel.lon + ((Math.floor(index / 10) % 10) - 5) * 0.002,
    sensors: ["VIIRS_SNPP"],
    confidence: "NOMINAL",
    frpMw: 7,
    brightnessK: 330,
    daynight: "D",
    sourceKeys: [`test-prevention-${key}-${index}`],
  }));
}

describe("conseil de la saison des feux", () => {
  beforeAll(async () => {
    // Commune d'un producteur consentant, où l'on sème 250 détections en novembre 2026.
    const [row] = await prisma.$queryRaw<{ commune_id: string; lon: number; lat: number }[]>`
      SELECT f."commune_id"::text AS commune_id,
             ST_X(p."centroid"::geometry) AS lon, ST_Y(p."centroid"::geometry) AS lat
        FROM "farm" f
        JOIN "parcel" p ON p."farm_id" = f."id" AND p."centroid" IS NOT NULL
        JOIN "farmer" fa ON fa."id" = f."farmer_id" AND fa."phone_e164" IS NOT NULL
        JOIN "channel_consent" cc
          ON cc."farmer_id" = fa."id" AND cc."channel" = 'WHATSAPP' AND cc."granted"
         AND cc."revoked_at" IS NULL
       WHERE f."archived_at" IS NULL
       ORDER BY f."code" LIMIT 1`;
    communeId = row!.commune_id;
    parcel = { lon: row!.lon, lat: row!.lat };
    await insertFireDetections(detections(new Date(Date.UTC(2026, 10, 1, 12, 30)), 250, "nov26"));
  }, 120_000);

  afterAll(async () => {
    await prisma.farmerNotification.deleteMany({
      where: { kind: "FIRE_PREVENTION", createdAt: { gte: since } },
    });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("ne fait rien tant que l'interrupteur est coupé, ni hors saison", async () => {
    expect(await queueFirePrevention({ now: MONDAY, enabled: false })).toEqual({
      status: "disabled",
    });
    expect(
      await queueFirePrevention({ now: new Date("2027-06-07T07:00:00Z"), enabled: true }),
    ).toEqual({ status: "off-season" });
  });

  it("met en file un conseil par producteur consentant des communes les plus touchées", async () => {
    const result = await queueFirePrevention({ now: MONDAY, enabled: true });
    expect(result).toMatchObject({ status: "queued", week: "2026-12-07" });
    if (result.status !== "queued") return;
    expect(result.communes).toBeGreaterThanOrEqual(1);
    expect(result.queued).toBeGreaterThanOrEqual(1);
    const queued = await prisma.farmerNotification.findMany({
      where: { kind: "FIRE_PREVENTION", createdAt: { gte: since } },
      select: {
        text: true,
        farmer: {
          select: {
            farms: { select: { communeId: true } },
            channelConsents: { select: { channel: true, granted: true, revokedAt: true } },
          },
        },
      },
    });
    expect(queued).toHaveLength(result.queued);
    expect(queued.some((row) => row.farmer.farms.some((f) => f.communeId === communeId))).toBe(
      true,
    );
    expect(
      queued.every((row) =>
        row.farmer.channelConsents.some(
          (c) => c.channel === "WHATSAPP" && c.granted && c.revokedAt === null,
        ),
      ),
    ).toBe(true);
    expect(queued[0]!.text).toContain("pare-feu");

    // Même semaine, plus tard : rien de plus.
    const again = await queueFirePrevention({
      now: new Date("2026-12-10T07:00:00Z"),
      enabled: true,
    });
    expect(again).toMatchObject({ status: "queued", queued: 0 });
  }, 120_000);

  it("retombe sur la dernière saison complète en base quand la saison passée manque", async () => {
    // Saison 2025-2026 absente : faute de saison complète, la saison en cours.
    const before = await preventionReference(MONDAY);
    expect(before).toMatchObject({
      kind: "current-season",
      label: "saison 2026-2027 en cours",
      missingLabel: "saison 2025-2026",
    });

    // Saison 2023-2024 chargée sur ses six mois (comme l'archive sans clé).
    for (const [year, month] of [
      [2023, 10],
      [2023, 11],
      [2024, 0],
      [2024, 1],
      [2024, 2],
      [2024, 3],
    ] as const) {
      await insertFireDetections(
        detections(new Date(Date.UTC(year, month, 2, 12, 30)), 60, `${year}-${month}`),
      );
    }
    const after = await preventionReference(MONDAY);
    expect(after).toMatchObject({
      kind: "latest-complete-season",
      startYear: 2023,
      label: "saison 2023-2024",
      missingLabel: "saison 2025-2026",
    });
    const status = await getFirePreventionStatus(MONDAY);
    expect(status.reference.label).toBe("saison 2023-2024");
    expect(status.communes.some((commune) => commune.id === communeId)).toBe(true);

    const queued = await queueFirePrevention({
      now: new Date("2026-12-14T07:00:00Z"),
      enabled: true,
    });
    expect(queued).toMatchObject({
      status: "queued",
      week: "2026-12-14",
      reference: "latest-complete-season",
      referenceLabel: "saison 2023-2024",
    });
  }, 120_000);
});
