import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  assignReferenceFieldCommunes,
  insertReferenceFields,
} from "@/database/reference-fields-store";
import { loadActor } from "@/modules/identity";
import { readReferenceFields, splitReferenceField } from "@/modules/reference-fields/read";

// Lecture des champs détectés pour l'agent (ADR-0029) : portée par compte, contour complet, fusion
// de champs contigus. Les géométries de test se posent à Djougou, commune de l'agent de démonstration.

const YEAR = 2097;
const AGENT = "+2290190000001";
const FARMER = "+2290190000002";
const MINISTRY = "+2290190000003";

// Deux carrés de 100 m qui se touchent (partage d'un côté) et un troisième à 500 m.
const square = (lng: number, lat: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [lng, lat],
      [lng + 0.000911, lat],
      [lng + 0.000911, lat + 0.000905],
      [lng, lat + 0.000905],
      [lng, lat],
    ],
  ],
});

let ids: { a: string; b: string; far: string } = { a: "", b: "", far: "" };

async function actorOf(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

beforeAll(async () => {
  await insertReferenceFields([
    { ref: "read-a", year: YEAR, confidence: 90, areaHa: 1, geometry: square(1.67, 9.7) },
    { ref: "read-b", year: YEAR, confidence: 85, areaHa: 1, geometry: square(1.670911, 9.7) },
    { ref: "read-far", year: YEAR, confidence: 80, areaHa: 1, geometry: square(1.675, 9.7) },
  ]);
  await assignReferenceFieldCommunes();
  const rows = await prisma.referenceField.findMany({ where: { year: YEAR } });
  const idOf = (ref: string) => String(rows.find((r) => r.sourceRef === ref)!.id);
  ids = { a: idOf("read-a"), b: idOf("read-b"), far: idOf("read-far") };
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "reference_field" WHERE "year" = ${YEAR}`;
  await prisma.$disconnect();
});

describe("lecture des champs détectés", () => {
  it("rend le contour complet d'un champ à l'agent de sa commune et au ministère", async () => {
    for (const phone of [AGENT, MINISTRY]) {
      const result = await readReferenceFields(await actorOf(phone), [ids.a]);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.fields).toHaveLength(1);
      expect(result.contour.geometry.coordinates[0]).toHaveLength(5);
    }
  });

  it("ne montre rien au producteur, et rien d'un champ inconnu", async () => {
    expect((await readReferenceFields(await actorOf(FARMER), [ids.a])).status).toBe("not_found");
    const agent = await actorOf(AGENT);
    expect((await readReferenceFields(agent, ["999999999999"])).status).toBe("not_found");
    expect((await readReferenceFields(agent, [])).status).toBe("not_found");
  });

  it("fusionne deux champs qui se touchent en un seul contour", async () => {
    const result = await readReferenceFields(await actorOf(AGENT), [ids.a, ids.b]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields).toHaveLength(2);
    // Deux carrés de 100 m sur 100 m côte à côte : environ 2 ha en un seul polygone.
    expect(result.contour.areaHa).toBeGreaterThan(1.9);
    expect(result.contour.areaHa).toBeLessThan(2.1);
    expect(result.contour.geometry.type).toBe("Polygon");
  });

  it("refuse de fusionner des champs qui ne se touchent pas", async () => {
    const result = await readReferenceFields(await actorOf(AGENT), [ids.a, ids.far]);
    expect(result.status).toBe("not_contiguous");
  });

  it("coupe un champ en deux parts le long d'une ligne qui le traverse", async () => {
    const result = await splitReferenceField(await actorOf(AGENT), ids.a, [
      [1.6704555, 9.70005],
      [1.6704555, 9.70085],
    ]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.parts).toHaveLength(2);
    const [west, east] = result.parts;
    expect(west!.areaHa).toBeGreaterThan(0.4);
    expect(east!.areaHa).toBeGreaterThan(0.4);
    expect(west!.areaHa + east!.areaHa).toBeCloseTo(1, 0);
  });

  it("refuse une ligne qui ne coupe pas le champ, et un champ hors portée", async () => {
    const outside = await splitReferenceField(await actorOf(AGENT), ids.a, [
      [1.669, 9.70005],
      [1.669, 9.70085],
    ]);
    expect(outside.status).toBe("invalid_cut");
    const same = await splitReferenceField(await actorOf(AGENT), ids.a, [
      [1.67045, 9.70045],
      [1.67045, 9.70045],
    ]);
    expect(same.status).toBe("invalid_cut");
    const farmer = await splitReferenceField(await actorOf(FARMER), ids.a, [
      [1.6704555, 9.70005],
      [1.6704555, 9.70085],
    ]);
    expect(farmer.status).toBe("not_found");
  });
});
