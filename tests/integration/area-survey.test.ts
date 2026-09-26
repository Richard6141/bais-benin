import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  classifyFramePoints,
  drawAreaFrame,
  getSurveyEstimates,
  listSurveyPoints,
} from "@/modules/area-survey";
import { loadActor } from "@/modules/identity";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Enquête aréolaire (ADR-0033) sur la vraie base : tirage des points d'une commune pilote,
// classe de la carte aux points (fixture), surfaces estimées pour le ministère seulement.

const PILOT = "BJ-DON-001";
const MINISTRY_PHONE = "+2290190000003";
const AGENT_PHONE = "+2290190000001";
const AGENT_COMMUNE = "BJ-DON-003";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

describe("enquête aréolaire", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("tire environ 120 points dans la commune, une seule fois par campagne", async () => {
    const commune = await prisma.commune.findUniqueOrThrow({
      where: { code: PILOT },
      select: { id: true },
    });
    const campaign = await prisma.agriculturalCampaign.findFirstOrThrow({
      where: { status: "OPEN" },
      select: { id: true },
    });
    await prisma.areaFrameObservation.deleteMany({
      where: { point: { communeId: commune.id, campaignId: campaign.id } },
    });
    await prisma.areaFramePoint.deleteMany({
      where: { communeId: commune.id, campaignId: campaign.id },
    });

    const first = await drawAreaFrame({ communeCodes: [PILOT] });
    const drawn = first.communes[0]!;
    expect(drawn.code).toBe(PILOT);
    expect(drawn.drawn).toBeGreaterThan(90);
    expect(drawn.drawn).toBeLessThan(150);

    // Chaque point tombe dans la commune.
    const outside = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
        FROM "area_frame_point" p JOIN "commune" c ON c."id" = p."commune_id"
       WHERE c."code" = ${PILOT} AND NOT ST_Intersects(c."geom", p."geom")`;
    expect(Number(outside[0]!.count)).toBe(0);

    const again = await drawAreaFrame({ communeCodes: [PILOT] });
    expect(again.communes).toEqual([]);
  });

  it("lit la classe de la carte à chaque point tiré", async () => {
    const run = await classifyFramePoints({
      provider: createFixtureRemoteSensingProvider(),
      limit: 500,
    });
    expect(run.errors).toBe(0);
    expect(run.classified).toBeGreaterThan(90);
    const missing = await prisma.areaFramePoint.count({
      where: { commune: { code: PILOT }, mapClass: null },
    });
    expect(missing).toBe(0);
  });

  it("rend les surfaces au ministère, et les points aux seules communes de l'agent", async () => {
    const points = await prisma.areaFramePoint.findMany({
      where: { commune: { code: PILOT } },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    const maize = await prisma.crop.findUniqueOrThrow({ where: { code: "MAIZE" } });
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: AGENT_PHONE },
      select: { id: true },
    });
    await prisma.areaFrameObservation.createMany({
      data: points.map((point, index) => ({
        id: crypto.randomUUID(),
        pointId: point.id,
        landCover: index % 3 === 0 ? ("CROP" as const) : ("NATURAL" as const),
        cropId: index % 3 === 0 ? maize.id : null,
        observedAt: new Date("2026-08-20T10:00:00Z"),
        distanceM: 12,
        observedById: agentUser.id,
        sourceId: "ATDA_TERRAIN",
        reliability: "FIELD_VERIFIED" as const,
      })),
    });

    const estimates = await getSurveyEstimates(await actorForPhone(MINISTRY_PHONE));
    const commune = estimates!.communes.find((entry) => entry.code === PILOT)!;
    expect(commune.observed).toBe(points.length);
    const maizeArea = commune.targets.find((entry) => entry.target === "MAIZE")!;
    expect(maizeArea.areaHa).toBeGreaterThan(0);
    expect(maizeArea.marginHa).toBeGreaterThan(0);
    expect(maizeArea.points).toBe(points.length);

    const agent = await actorForPhone(AGENT_PHONE);
    expect(await getSurveyEstimates(agent)).toBeNull();
    // L'agent de démonstration couvre la commune AGENT_COMMUNE : il en voit les points, pas ceux
    // de la commune pilote.
    await drawAreaFrame({ communeCodes: [AGENT_COMMUNE], pointsPerCommune: 10 });
    const agentPoints = await listSurveyPoints(agent);
    expect(agentPoints.length).toBeGreaterThan(0);
    expect(agentPoints.every((point) => point.code.startsWith(`${AGENT_COMMUNE}-`))).toBe(true);
  }, 120_000);
});
