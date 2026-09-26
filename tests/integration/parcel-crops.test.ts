import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import {
  collectParcelSeries,
  getParcelCropPrediction,
  trainAndPredictCrops,
} from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Cultures par parcelle (ADR-0030) sur la vraie base, avec la fixture : séries des parcelles d'une
// commune pilote, modèle entraîné sur les parcelles vérifiées, culture mesurée et ses droits.

const PILOT = "BJ-BOR-008";
const AGENT_PHONE = "+2290190000001";
const MINISTRY_PHONE = "+2290190000003";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

describe("cultures par parcelle", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lit les séries, entraîne le modèle et mesure la culture de chaque parcelle lue", async () => {
    const series = await collectParcelSeries({
      provider: createFixtureRemoteSensingProvider(),
      limit: 400,
      communeCodes: [PILOT],
      now: new Date("2099-01-01T00:00:00Z"),
    });
    expect(series.errors).toBe(0);
    const model = await trainAndPredictCrops({ force: true });
    expect(model.version).not.toBeNull();
    expect(model.trainingParcels).toBeGreaterThan(50);
    expect(model.outOfBagAccuracy).toBeGreaterThan(0.6);
    expect(model.predicted).toBeGreaterThanOrEqual(model.trainingParcels);
    const stored = await prisma.cropModel.findUniqueOrThrow({
      where: { version: model.version! },
      select: { classes: true, featureNames: true, trainingParcels: true },
    });
    expect(stored.classes).toEqual(model.classes);
    expect(stored.trainingParcels).toBe(model.trainingParcels);
  }, 180_000);

  it("rend la culture mesurée au ministère, et rien pour une parcelle sans mesure", async () => {
    const ministry = await actorForPhone(MINISTRY_PHONE);
    const measured = await prisma.parcelCropPrediction.findFirstOrThrow({
      where: { agreement: "AGREES" },
      select: { parcelId: true },
    });
    const prediction = await getParcelCropPrediction(ministry, measured.parcelId);
    expect(prediction).not.toBeNull();
    expect(prediction!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(prediction!.cropLabel).toBe(prediction!.declaredLabel);
    expect(prediction!.cropLabel).not.toMatch(/[·…—]/);

    const unmeasured = await prisma.parcel.findFirstOrThrow({
      where: { cropPredictions: { none: {} }, archivedAt: null },
      select: { id: true },
    });
    expect(await getParcelCropPrediction(ministry, unmeasured.id)).toBeNull();
    expect(
      await getParcelCropPrediction(ministry, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("ne montre rien à un agent hors des exploitations qu'il a enregistrées (ADR-0014)", async () => {
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: AGENT_PHONE },
      select: { id: true },
    });
    const other = await prisma.parcelCropPrediction.findFirstOrThrow({
      where: {
        parcel: {
          farm: {
            OR: [{ registeredById: null }, { registeredById: { not: agentUser.id } }],
          },
        },
      },
      select: { parcelId: true },
    });
    const agent = await loadActor(agentUser.id);
    expect(await getParcelCropPrediction(agent, other.parcelId)).toBeNull();
  });

  it("s'arrête au plafond mensuel d'unités, sans lire une parcelle de plus", async () => {
    const fixture = createFixtureRemoteSensingProvider();
    // Faux compte Copernicus : chaque lecture est facturée une unité.
    const metered = {
      ...fixture,
      id: "cdse" as const,
      provenance: {
        ...fixture.provenance,
        sourceId: "COPERNICUS_S2" as const,
        reliability: "ESTIMATED" as const,
      },
      parcelSeries: async (request: Parameters<typeof fixture.parcelSeries>[0]) => ({
        ...(await fixture.parcelSeries(request)),
        processingUnits: 1,
      }),
    };
    const later = new Date("2099-06-15T00:00:00Z");
    try {
      const run = await collectParcelSeries({
        provider: metered,
        limit: 10,
        communeCodes: [PILOT],
        now: later,
        monthlyUnitCap: 2,
      });
      expect(run.read).toBe(2);
      expect(run.stopped).toBe("monthly-cap");
      expect(run.monthUnits).toBe(2);
    } finally {
      // La démonstration reprend ses séries synthétiques.
      await prisma.parcelSignature.deleteMany({ where: { sourceId: "COPERNICUS_S2" } });
      await prisma.satelliteUsage.deleteMany({ where: { month: "2099-06" } });
    }
  }, 120_000);
});
