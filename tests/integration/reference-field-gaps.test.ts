import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  assignReferenceFieldCommunes,
  insertReferenceFields,
} from "@/database/reference-fields-store";
import { loadActor } from "@/modules/identity";
import { listFieldGaps } from "@/modules/reference-fields/gaps";

// Champs détectés sans exploitant et champs apparus d'une année à l'autre (ADR-0029), comptés dans
// les communes couvertes seulement. Années fictives : seules ces lignes existent pour elles.

const YEAR = 2096;
const AGENT = "+2290190000001";
const FARMER = "+2290190000002";
const MINISTRY = "+2290190000003";

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

async function actorOf(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

beforeAll(async () => {
  await insertReferenceFields([
    { ref: "old-1", year: YEAR - 1, confidence: 90, areaHa: 1, geometry: square(1.66, 9.71) },
    { ref: "old-2", year: YEAR - 1, confidence: 90, areaHa: 1, geometry: square(1.6611, 9.71) },
    { ref: "kept", year: YEAR, confidence: 90, areaHa: 1, geometry: square(1.66, 9.71) },
    { ref: "new", year: YEAR, confidence: 90, areaHa: 1, geometry: square(1.6635, 9.7135) },
  ]);
  await assignReferenceFieldCommunes();
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "reference_field" WHERE "year" IN (${YEAR}, ${YEAR - 1})`;
  await prisma.$disconnect();
});

describe("écart entre champs détectés et registre", () => {
  it("compte les champs sans exploitant et ceux apparus depuis l'année précédente", async () => {
    const gaps = await listFieldGaps(await actorOf(MINISTRY), YEAR);
    const total = gaps.reduce((sum, gap) => sum + gap.detected, 0);
    expect(total).toBe(2);
    const djougou = gaps.find((gap) => gap.detected === 2);
    expect(djougou?.unregistered).toBe(2);
    expect(djougou?.appeared).toBe(1);
  });

  it("laisse l'année précédente sans nouveauté à calculer", async () => {
    const gaps = await listFieldGaps(await actorOf(MINISTRY), YEAR - 1);
    expect(gaps.every((gap) => gap.appeared === null)).toBe(true);
  });

  it("limite l'agent à ses communes et ne dit rien au producteur", async () => {
    const agent = await listFieldGaps(await actorOf(AGENT), YEAR);
    expect(agent.reduce((sum, gap) => sum + gap.detected, 0)).toBe(2);
    expect(await listFieldGaps(await actorOf(FARMER), YEAR)).toEqual([]);
  });
});
