import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import { proposeFieldContours } from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Délimitation assistée (ADR-0016, phase 3) sur la vraie base, avec la fixture (champ synthétique
// autour du point, sans réseau) : qui peut demander une proposition, où, et ce qu'elle renvoie.

const AGENT_PHONE = "+2290190000001";

async function agent() {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: AGENT_PHONE },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

async function parcelOf(where: object) {
  const rows = await prisma.$queryRaw<{ id: string; lng: number; lat: number }[]>`
    SELECT p."id", ST_X(p."centroid"::geometry) AS lng, ST_Y(p."centroid"::geometry) AS lat
      FROM "parcel" p WHERE p."id" = (
        SELECT id FROM "parcel" WHERE "farm_id" = ${(where as { farmId: string }).farmId}::uuid
         AND "centroid" IS NOT NULL LIMIT 1)`;
  return rows[0] ?? null;
}

describe("propositions de contours de champ", () => {
  const provider = createFixtureRemoteSensingProvider();

  afterAll(async () => {
    const { id } = await agent();
    await prisma.rateLimit.deleteMany({ where: { key: `satellite-proposal:${id}` } });
    await prisma.$disconnect();
  });

  it("propose à l'agent des contours autour d'une parcelle de ses exploitations", async () => {
    const { id, actor } = await agent();
    const farm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: id, archivedAt: null, parcels: { some: {} } },
      select: { id: true },
    });
    const parcel = await parcelOf({ farmId: farm.id });
    expect(parcel).not.toBeNull();
    const outcome = await proposeFieldContours(actor, { parcelId: parcel!.id }, provider);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.candidates.length).toBeGreaterThan(0);
    for (const candidate of outcome.candidates) {
      const ring = candidate.geometry.coordinates[0] ?? [];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      // Champ synthétique de la fixture : 1 à 4 ha, surface recalculée par PostGIS.
      expect(candidate.areaHa).toBeGreaterThan(0.5);
      expect(candidate.areaHa).toBeLessThan(5);
      // Le contour entoure le point désigné.
      const lons = ring.map(([lon]) => lon);
      const lats = ring.map(([, lat]) => lat);
      expect(Math.min(...lons)).toBeLessThan(outcome.point.lon);
      expect(Math.max(...lons)).toBeGreaterThan(outcome.point.lon);
      expect(Math.min(...lats)).toBeLessThan(outcome.point.lat);
      expect(Math.max(...lats)).toBeGreaterThan(outcome.point.lat);
    }
    expect(outcome.sourceId).toBe("BAIS_SEED");

    // Un point à plus de 2 km de la parcelle est refusé : pas de balayage du territoire.
    const far = await proposeFieldContours(
      actor,
      { parcelId: parcel!.id, lon: parcel!.lng + 0.05, lat: parcel!.lat },
      provider,
    );
    expect(far.status).toBe("point-too-far");
  });

  it("refuse une parcelle d'une exploitation que l'agent n'a pas enregistrée (ADR-0014)", async () => {
    const { id, actor } = await agent();
    const other = await prisma.farm.findFirstOrThrow({
      where: {
        OR: [{ registeredById: null }, { registeredById: { not: id } }],
        archivedAt: null,
        parcels: { some: {} },
      },
      select: { id: true },
    });
    const parcel = await parcelOf({ farmId: other.id });
    const outcome = await proposeFieldContours(actor, { parcelId: parcel!.id }, provider);
    expect(outcome.status).toBe("not-found");
  });
});
