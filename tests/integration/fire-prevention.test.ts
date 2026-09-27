import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { insertFireDetections } from "@/database/sql/fires.sql";
import { queueFirePrevention } from "@/modules/fires";

// Conseil de la saison des feux (ADR-0038 §3) sur la vraie base : rien tant que l'interrupteur
// est coupé ni hors saison ; en saison, un message par producteur consentant des communes les plus
// touchées, et rien de plus si la tâche repasse la même semaine.

const since = new Date(Date.now() - 60_000);
/** Lundi 7 décembre 2026, 8 h à Porto-Novo. */
const MONDAY = new Date("2026-12-07T07:00:00Z");
let communeId: string;

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
    await insertFireDetections(
      Array.from({ length: 250 }, (_, index) => ({
        id: crypto.randomUUID(),
        detectedAt: new Date(Date.UTC(2026, 10, 1 + (index % 28), 12, 30)),
        latitude: row!.lat + ((index % 10) - 5) * 0.002,
        longitude: row!.lon + ((Math.floor(index / 10) % 10) - 5) * 0.002,
        sensors: ["VIIRS_SNPP"],
        confidence: "NOMINAL",
        frpMw: 7,
        brightnessK: 330,
        daynight: "D",
        sourceKeys: [`test-prevention-${index}`],
      })),
    );
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
});
