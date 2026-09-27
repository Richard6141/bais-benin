import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  FIRST_PHASE_FACTOR,
  MIN_POINTS_PER_STRATUM,
  POINTS_PER_COMMUNE,
  classifyFramePoints,
  drawAreaFrame,
  getSurveyEstimates,
  listSurveyPoints,
  selectSecondPhase,
} from "@/modules/area-survey";
import { loadActor } from "@/modules/identity";
import { applySyncBatch } from "@/modules/sync";
import { CROP_AREA_METHOD_VERSION } from "@/modules/satellite/crop-areas";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Enquête aréolaire (ADR-0033, ADR-0037) sur la vraie base : première phase d'une commune pilote,
// classe de la carte aux points (fixture), seconde phase stratifiée, surfaces estimées pour le
// ministère seulement, points à visiter montrés aux seules communes de l'agent.

const PILOT = "BJ-DON-001";
const MINISTRY_PHONE = "+2290190000003";
const AGENT_PHONE = "+2290190000001";
const AGENT_COMMUNE = "BJ-DON-003";
const DEVICE = "test-device-enquete";
const AT = "2026-08-20T10:00:00+01:00";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

describe("enquête aréolaire", () => {
  afterAll(async () => {
    // Les constats du test et les points de la commune de l'agent (hors enquête) ne restent pas
    // dans la base de démonstration.
    await prisma.areaFrameObservation.deleteMany({
      where: {
        observedAt: { in: [new Date(AT), new Date("2026-08-20T10:00:00Z")] },
        point: { commune: { code: { in: [PILOT, AGENT_COMMUNE] } } },
      },
    });
    await prisma.areaFrameObservation.deleteMany({
      where: { point: { commune: { code: AGENT_COMMUNE } } },
    });
    await prisma.areaFramePoint.deleteMany({ where: { commune: { code: AGENT_COMMUNE } } });
    await prisma.$disconnect();
  });

  it("tire une première phase quatre fois plus dense, une seule fois par campagne", async () => {
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
    const expected = POINTS_PER_COMMUNE * FIRST_PHASE_FACTOR;
    expect(drawn.drawn).toBeGreaterThan(expected * 0.75);
    expect(drawn.drawn).toBeLessThan(expected * 1.25);
    // Aucun point n'est encore à visiter : la première phase attend la classe de la carte.
    expect(
      await prisma.areaFramePoint.count({
        where: { communeId: commune.id, campaignId: campaign.id, selected: true },
      }),
    ).toBe(0);

    // Chaque point tombe dans la commune.
    const outside = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
        FROM "area_frame_point" p JOIN "commune" c ON c."id" = p."commune_id"
       WHERE c."code" = ${PILOT} AND NOT ST_Intersects(c."geom", p."geom")`;
    expect(Number(outside[0]!.count)).toBe(0);

    const again = await drawAreaFrame({ communeCodes: [PILOT] });
    expect(again.communes).toEqual([]);
  });

  it("lit la classe de la carte à chaque point de première phase", async () => {
    const run = await classifyFramePoints({
      provider: createFixtureRemoteSensingProvider(),
      limit: 2000,
    });
    expect(run.errors).toBe(0);
    expect(run.classified).toBeGreaterThan(POINTS_PER_COMMUNE * 3);
    const missing = await prisma.areaFramePoint.count({
      where: { commune: { code: PILOT }, mapClass: null },
    });
    expect(missing).toBe(0);
  }, 120_000);

  it("tire la seconde phase par strate, plancher compris, et la fige", async () => {
    const result = await selectSecondPhase({ communeCodes: [PILOT] });
    const commune = result.communes.find((entry) => entry.code === PILOT)!;
    const { ANNUAL_CROPS: annual, OTHER_LAND: other } = commune.strata;
    expect(annual.selected + other.selected).toBe(POINTS_PER_COMMUNE);
    expect(annual.selected).toBeGreaterThanOrEqual(
      Math.min(MIN_POINTS_PER_STRATUM, annual.firstPhase),
    );
    expect(other.selected).toBeGreaterThanOrEqual(
      Math.min(MIN_POINTS_PER_STRATUM, other.firstPhase),
    );
    const points = await prisma.areaFramePoint.findMany({
      where: { commune: { code: PILOT }, campaign: { status: "OPEN" } },
      select: { stratum: true, selected: true },
    });
    expect(points.every((point) => point.stratum !== null)).toBe(true);
    expect(points.filter((point) => point.selected)).toHaveLength(POINTS_PER_COMMUNE);
    expect(
      points.filter((point) => point.selected && point.stratum === "ANNUAL_CROPS"),
    ).toHaveLength(annual.selected);

    // La strate est figée : ni second tirage, ni nouvelle lecture de la carte.
    const again = await selectSecondPhase({ communeCodes: [PILOT] });
    expect(again.communes).toEqual([]);
    await prisma.areaFramePoint.updateMany({
      where: { commune: { code: PILOT } },
      data: { mapMethodVersion: 0 },
    });
    await classifyFramePoints({ provider: createFixtureRemoteSensingProvider(), limit: 2000 });
    expect(
      await prisma.areaFramePoint.count({
        where: { commune: { code: PILOT }, mapMethodVersion: { not: 0 } },
      }),
    ).toBe(0);
    await prisma.areaFramePoint.updateMany({
      where: { commune: { code: PILOT } },
      data: { mapMethodVersion: CROP_AREA_METHOD_VERSION },
    });
  }, 120_000);

  it("rend les surfaces au ministère, et les points aux seules communes de l'agent", async () => {
    const points = await prisma.areaFramePoint.findMany({
      where: { commune: { code: PILOT }, selected: true },
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
    expect(commune.design).toBe("stratified");
    expect(commune.drawn).toBe(POINTS_PER_COMMUNE);
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
    // La première phase n'est pas montrée : l'agent ne voit que les points retenus.
    expect(await listSurveyPoints(agent)).toEqual([]);
    await classifyFramePoints({ provider: createFixtureRemoteSensingProvider(), limit: 2000 });
    await selectSecondPhase({ communeCodes: [AGENT_COMMUNE], pointsPerCommune: 10 });
    const agentPoints = await listSurveyPoints(agent);
    expect(agentPoints).toHaveLength(10);
    expect(agentPoints.every((point) => point.code.startsWith(`${AGENT_COMMUNE}-`))).toBe(true);
  }, 120_000);

  it("enregistre le constat de l'agent près du point, et refuse de loin ou hors de ses communes", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const point = await prisma.areaFramePoint.findFirstOrThrow({
      where: { commune: { code: AGENT_COMMUNE }, campaign: { status: "OPEN" }, selected: true },
      select: { id: true, latitude: true, longitude: true },
      orderBy: { code: "asc" },
    });
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    const observe = (payload: Record<string, unknown>) => {
      const id = crypto.randomUUID();
      return applySyncBatch(agent, DEVICE, [
        {
          id,
          type: "surveyPoint.observe",
          payload: { id, pointId: point.id, observedAt: AT, ...payload },
          idempotencyKey: `it-${id}`,
          clientCreatedAt: AT,
          deviceId: DEVICE,
        },
      ]);
    };

    const [far] = await observe({ landCover: "NATURAL", gpsPoint: [lng, lat + 0.001] });
    expect(far?.outcome).toBe("REJECTED");
    expect(far?.error?.code).toBe("TOO_FAR");

    const [near] = await observe({
      landCover: "CROP",
      cropCode: "COTTON",
      gpsPoint: [lng, lat + 0.0001],
    });
    expect(near?.outcome).toBe("APPLIED");
    const stored = await prisma.areaFrameObservation.findUniqueOrThrow({
      where: { id: near!.entity!.id },
      select: { landCover: true, distanceM: true, crop: { select: { code: true } } },
    });
    expect(stored).toEqual({ landCover: "CROP", distanceM: 11, crop: { code: "COTTON" } });

    const [blocked] = await observe({ landCover: "INACCESSIBLE", reason: "Rivière en crue" });
    expect(blocked?.outcome).toBe("APPLIED");

    // Un point de première phase non retenu n'accepte pas de constat.
    const skipped = await prisma.areaFramePoint.findFirstOrThrow({
      where: { commune: { code: AGENT_COMMUNE }, campaign: { status: "OPEN" }, selected: false },
      select: { id: true, latitude: true, longitude: true },
    });
    const skippedId = crypto.randomUUID();
    const [notDrawn] = await applySyncBatch(agent, DEVICE, [
      {
        id: skippedId,
        type: "surveyPoint.observe",
        payload: {
          id: skippedId,
          pointId: skipped.id,
          observedAt: AT,
          landCover: "NATURAL",
          gpsPoint: [Number(skipped.longitude), Number(skipped.latitude)],
        },
        idempotencyKey: `it-${skippedId}`,
        clientCreatedAt: AT,
        deviceId: DEVICE,
      },
    ]);
    expect(notDrawn?.outcome).toBe("REJECTED");
    expect(notDrawn?.error?.code).toBe("NOT_FOUND");

    const pilot = await prisma.areaFramePoint.findFirstOrThrow({
      where: { commune: { code: PILOT }, selected: true },
      select: { id: true, latitude: true, longitude: true },
    });
    const outsideId = crypto.randomUUID();
    const [outside] = await applySyncBatch(agent, DEVICE, [
      {
        id: outsideId,
        type: "surveyPoint.observe",
        payload: {
          id: outsideId,
          pointId: pilot.id,
          observedAt: AT,
          landCover: "NATURAL",
          gpsPoint: [Number(pilot.longitude), Number(pilot.latitude)],
        },
        idempotencyKey: `it-${outsideId}`,
        clientCreatedAt: AT,
        deviceId: DEVICE,
      },
    ]);
    expect(outside?.outcome).toBe("REJECTED");
    expect(outside?.error?.code).toBe("NOT_FOUND");
  });
});
