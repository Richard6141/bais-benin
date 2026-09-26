import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { referenceFieldsTile } from "@/database/sql/tiles.sql";
import { lonLatToTile } from "@/lib/geo/tile-math";
import { renderTile } from "@/modules/territory/tiles";
import { measureReferenceQuality } from "@/modules/reference-fields/quality";
import {
  FTW_SOURCE_ID,
  assignReferenceFieldCommunes,
  insertReferenceFields,
} from "@/database/reference-fields-store";

// Champs de référence (ADR-0029) : import rejouable, rattachement à la commune, et mesure de
// qualité face à une parcelle relevée. Les géométries de test se construisent en UTM 31N pour
// que les recouvrements soient exacts : un champ de 100 m sur 100 m et une parcelle de même taille
// décalée de 20 m se recouvrent à 8 000 m2 sur 12 000 m2 d'union, soit un IoU de 2/3.

const YEAR = 2099;
const PARCEL_CODE = "TEST-FTW-PARCEL-1";

async function squareGeoJson(offsetX: number): Promise<string> {
  const rows = await prisma.$queryRaw<{ geojson: string }[]>`
    WITH origin AS (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint(1.67, 9.7), 4326), 32631) AS p
    )
    SELECT ST_AsGeoJSON(ST_Transform(ST_MakeEnvelope(
      ST_X(p) + ${offsetX}::float8, ST_Y(p), ST_X(p) + ${offsetX}::float8 + 100, ST_Y(p) + 100, 32631), 4326)) AS geojson
    FROM origin`;
  return rows[0]!.geojson;
}

let parcelId = "";

beforeAll(async () => {
  const farm = await prisma.farm.findFirstOrThrow({ select: { id: true } });
  const parcel = await prisma.parcel.create({
    data: {
      code: PARCEL_CODE,
      farmId: farm.id,
      declaredAreaHa: 1,
      captureMethod: "GPS_WALK",
      sourceId: "BAIS_SEED",
      sourceDate: new Date(),
      reliability: "DECLARED",
    },
  });
  parcelId = parcel.id;
  const geojson = await squareGeoJson(20);
  await prisma.$executeRaw`
    UPDATE "parcel" SET "geom" = ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geography
    WHERE "id" = ${parcelId}::uuid`;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "reference_field" WHERE "year" = ${YEAR}`;
  await prisma.parcel.deleteMany({ where: { code: PARCEL_CODE } });
  await prisma.$disconnect();
});

describe("champs de référence", () => {
  it("s'importe une seule fois même rejoué, et se rattache à une commune", async () => {
    const geometry = JSON.parse(await squareGeoJson(0)) as {
      type: "Polygon";
      coordinates: number[][][];
    };
    const row = { ref: "test-1", year: YEAR, confidence: 88, areaHa: 1, geometry };
    expect(await insertReferenceFields([row])).toBe(1);
    expect(await insertReferenceFields([row])).toBe(0);
    await assignReferenceFieldCommunes();
    const stored = await prisma.referenceField.findMany({
      where: { sourceId: FTW_SOURCE_ID, year: YEAR },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.communeId).not.toBeNull();
  });

  it("mesure le recouvrement d'une parcelle relevée avec un champ de référence", async () => {
    const quality = await measureReferenceQuality({ year: YEAR, parcelIds: [parcelId] });
    expect(quality.parcels).toBe(1);
    expect(quality.medianIou).toBeCloseTo(2 / 3, 2);
    expect(quality.medianCoverage).toBeCloseTo(0.8, 2);
    expect(quality.found).toBe(1);
    expect(quality.foundShare).toBe(1);
  });

  it("sert les champs par tuile dès le zoom 12, selon la portée demandée", async () => {
    const at12 = lonLatToTile(1.67, 9.7, 12);
    const all = await referenceFieldsTile(12, at12.x, at12.y, null);
    expect(all).not.toBeNull();
    expect(all!.byteLength).toBeGreaterThan(100);

    // Sous le zoom 12 : pas de tuile. Portée vide : pas de tuile. Sans portée précisée : vide.
    const at11 = lonLatToTile(1.67, 9.7, 11);
    expect(await referenceFieldsTile(11, at11.x, at11.y, null)).toBeNull();
    expect(await referenceFieldsTile(12, at12.x, at12.y, [])).toBeNull();
    expect(await renderTile("fields", 12, at12.x, at12.y)).toBeNull();

    // Une commune sans champs ne reçoit rien ; la commune de Djougou reçoit la tuile.
    const communes = await prisma.commune.findMany({
      where: { code: { in: ["BJ-DON-003", "BJ-LIT-001"] } },
      select: { id: true, code: true },
    });
    const djougou = communes.find((c) => c.code === "BJ-DON-003")!.id;
    const cotonou = communes.find((c) => c.code === "BJ-LIT-001")!.id;
    expect(await referenceFieldsTile(12, at12.x, at12.y, [cotonou])).toBeNull();
    expect(await referenceFieldsTile(12, at12.x, at12.y, [djougou])).not.toBeNull();
  });
});
