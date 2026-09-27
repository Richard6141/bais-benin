import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { evaluateNewFires, seedDefaultRules } from "@/modules/monitoring";
import { runFireIngestion, type FireIngestionSummary } from "@/modules/fires";
import { getFireBrief } from "@/modules/fires/brief";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { FixtureFireProvider } from "@/services/fires";
import type { RawFireDetection } from "@/services/ports/fire-detection-provider";

// Fiche courte d'un feu détecté (chantier K) : exploitations menacées, cultures déclarées et
// producteurs prévenus, dans la portée de chacun. Réutilise le pipeline complet (ingestion, règle,
// destinataires) plutôt que d'insérer des lignes toutes faites, pour rester fidèle au vrai calcul.

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const since = new Date(now.getTime() - 60_000);

let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let farm: { id: string; communeId: string };
let fireId: string;
let alertId: string;

describe("fiche courte d'un feu détecté", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await seedDefaultRules();
    const [row] = await prisma.$queryRaw<
      { lon: number; lat: number; farm_id: string; commune_id: string }[]
    >`
      SELECT ST_X(p."centroid"::geometry) AS lon, ST_Y(p."centroid"::geometry) AS lat,
             f."id"::text AS farm_id, f."commune_id"::text AS commune_id
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "farmer" fa ON fa."id" = f."farmer_id" JOIN "user" u ON u."id" = fa."user_id"
      WHERE u."phone_e164" = '+2290190000002' AND p."centroid" IS NOT NULL
      ORDER BY p."code" LIMIT 1`;
    farm = { id: row!.farm_id, communeId: row!.commune_id };

    const detection = (values: Partial<RawFireDetection>): RawFireDetection => ({
      sensor: "VIIRS_SNPP",
      latitude: row!.lat,
      longitude: row!.lon + 0.0027,
      acquiredAt: hoursAgo(2),
      confidenceRaw: "high",
      frpMw: 20,
      brightnessK: 335,
      daynight: "D",
      ...values,
    });
    const ingestion: FireIngestionSummary = await runFireIngestion({
      provider: new FixtureFireProvider([detection({})]),
      now,
    });
    fireId = ingestion.changedIds[0]!;
    await evaluateNewFires(ingestion.changedIds, now);
    const alert = await prisma.alert.findFirstOrThrow({
      where: { communeId: farm.communeId, category: "FIRE", status: "ACTIVE" },
    });
    alertId = alert.id;
    // Le message WhatsApp du producteur est bien parti (le compte "prévenus par message" doit le
    // voir) ; sa ligne IN_APP, elle, reste au statut de planification (compte "informés" quand même).
    await prisma.alertRecipient.updateMany({
      where: { alertId, farmId: farm.id, channel: "WHATSAPP" },
      data: { status: "SENT" },
    });

    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000001" },
    });
    const farmerUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000002" },
    });
    [ministry, agent, farmer] = await Promise.all([
      loadActor(ministryUser.id),
      loadActor(agentUser.id),
      loadActor(farmerUser.id),
    ]);
  }, 180_000);

  afterAll(async () => {
    await prisma.alertRecipient.deleteMany({ where: { alertId } });
    await prisma.alert.deleteMany({ where: { category: "FIRE", startsAt: { gte: since } } });
    await prisma.ruleEvaluation.deleteMany({
      where: { rule: { code: "FIRE_NEAR_PARCELS" }, evaluatedAt: { gte: since } },
    });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.fireIngestionRun.deleteMany({ where: { startedAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("répond au ministère avec les exploitations, les cultures et le lien de l'alerte", async () => {
    const brief = await getFireBrief(ministry, fireId);
    expect(brief?.inScope).toBe(true);
    expect(brief?.farmsWithin1km).toBeGreaterThanOrEqual(1);
    expect(brief?.notifiedByMessage).toBeGreaterThanOrEqual(1);
    expect(brief?.informedInApp).toBeGreaterThanOrEqual(1);
    expect(brief?.alertHref).toBe(`/pilotage/alertes/${alertId}`);
  });

  it("répond de la même façon à un visiteur non connecté (national, sans lien)", async () => {
    const brief = await getFireBrief(null, fireId);
    expect(brief?.inScope).toBe(true);
    expect(brief?.farmsWithin1km).toBeGreaterThanOrEqual(1);
    expect(brief?.alertHref).toBeNull();
  });

  it("donne à l'agent le lien vers sa fiche d'alerte", async () => {
    const brief = await getFireBrief(agent, fireId);
    expect(brief?.inScope).toBe(true);
    expect(brief?.alertHref).toBe(`/agent/alertes/${alertId}`);
  });

  it("ne montre au producteur que sa propre exploitation", async () => {
    const brief = await getFireBrief(farmer, fireId);
    expect(brief?.inScope).toBe(true);
    expect(brief?.farmsWithin1km).toBe(1);
    expect(brief?.notifiedByMessage).toBe(1);
    expect(brief?.informedInApp).toBe(1);
    expect(brief?.alertHref).toBe(`/agriculteur/alertes/${alertId}`);
  });

  it("répond introuvable pour un identifiant inconnu", async () => {
    expect(await getFireBrief(ministry, "00000000-0000-7000-8000-000000000000")).toBeNull();
  });
});
