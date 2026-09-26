import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { parcelPolygonsTile } from "@/database/sql/tiles.sql";
import { lonLatToTile } from "@/lib/geo/tile-math";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { MIN_YIELD_PEERS, getParcelInspection } from "@/modules/registry";

// Carte au champ : tuiles des contours de parcelles et fiche d'une parcelle cliquée. Le ministère
// voit tout le pays (lecture journalisée), l'agent seulement les exploitations qu'il a
// enregistrées (ADR-0014), le producteur seulement les siennes. Hors portée, la parcelle
// « n'existe pas » et la tuile ne la porte pas.

interface ParcelRef {
  id: string;
  lon: number;
  lat: number;
}

let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let agentParcel: ParcelRef;
let farmerParcel: ParcelRef;
let foreignParcel: ParcelRef;

async function firstParcel(where: object): Promise<ParcelRef> {
  const parcel = await prisma.parcel.findFirstOrThrow({
    where: { archivedAt: null, farm: { archivedAt: null, ...where } },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  const [point] = await prisma.$queryRaw<{ lon: number; lat: number }[]>`
    SELECT ST_X(ST_Centroid("geom"::geometry)) AS lon, ST_Y(ST_Centroid("geom"::geometry)) AS lat
    FROM "parcel" WHERE "id" = ${parcel.id}::uuid AND "geom" IS NOT NULL`;
  if (!point) throw new Error("Parcelle de démonstration sans contour");
  return { id: parcel.id, lon: point.lon, lat: point.lat };
}

function tileOf(parcel: ParcelRef, zoom = 15) {
  return { zoom, ...lonLatToTile(parcel.lon, parcel.lat, zoom) };
}

describe("carte au champ", () => {
  beforeAll(async () => {
    await seedReferenceData();
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
    agentParcel = await firstParcel({ registeredById: agentUser.id });
    farmerParcel = await firstParcel({ farmer: { userId: farmerUser.id } });
    // Une parcelle du Borgou, loin de Djougou, ni enregistrée par l'agent ni au producteur de démo.
    foreignParcel = await firstParcel({
      registeredById: null,
      farmer: { userId: null },
      commune: { code: "BJ-BOR-008" },
    });
  }, 240_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("tuiles des parcelles", () => {
    it("sert tout le pays au ministère, rien sous le zoom 12 ni pour un périmètre vide", async () => {
      const { zoom, x, y } = tileOf(foreignParcel);
      const tile = await parcelPolygonsTile(zoom, x, y, null);
      expect(tile).not.toBeNull();
      expect(Buffer.from(tile as Buffer).includes("parcels")).toBe(true);
      const coarse = tileOf(foreignParcel, 11);
      await expect(parcelPolygonsTile(coarse.zoom, coarse.x, coarse.y, null)).resolves.toBeNull();
      await expect(parcelPolygonsTile(zoom, x, y, [])).resolves.toBeNull();
    });

    it("ne montre à l'agent que les parcelles qu'il a enregistrées", async () => {
      const scope = { registeredBy: agent.userId };
      const own = tileOf(agentParcel);
      await expect(parcelPolygonsTile(own.zoom, own.x, own.y, scope)).resolves.not.toBeNull();
      const other = tileOf(foreignParcel);
      await expect(parcelPolygonsTile(other.zoom, other.x, other.y, scope)).resolves.toBeNull();
    });

    it("ne montre au producteur que ses propres parcelles", async () => {
      const scope = { ownerUserId: farmer.userId };
      const own = tileOf(farmerParcel);
      await expect(parcelPolygonsTile(own.zoom, own.x, own.y, scope)).resolves.not.toBeNull();
      const other = tileOf(foreignParcel);
      await expect(parcelPolygonsTile(other.zoom, other.x, other.y, scope)).resolves.toBeNull();
    });
  });

  describe("fiche d'une parcelle", () => {
    it("donne au ministère la fiche complète, téléphone compris, et journalise la lecture", async () => {
      const before = await prisma.auditLog.count({
        where: { action: "registry.parcel.inspected", resourceId: foreignParcel.id },
      });
      const parcel = await getParcelInspection(ministry, foreignParcel.id);
      expect(parcel).not.toBeNull();
      expect(parcel!.farmer.displayName.length).toBeGreaterThan(0);
      expect(parcel!.farm.communeName.length).toBeGreaterThan(0);
      expect(parcel!.bbox).not.toBeNull();
      const [west, south, east, north] = parcel!.bbox!;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      const after = await prisma.auditLog.count({
        where: { action: "registry.parcel.inspected", resourceId: foreignParcel.id },
      });
      expect(after).toBe(before + 1);
    });

    it("ne compare un rendement qu'avec assez de parcelles voisines", async () => {
      const parcel = await getParcelInspection(ministry, foreignParcel.id);
      for (const crop of parcel!.crops) {
        if (crop.communeMedianTPerHa !== null) {
          expect(crop.peers).toBeGreaterThanOrEqual(MIN_YIELD_PEERS);
          expect(crop.betterThanShare).toBeGreaterThanOrEqual(0);
          expect(crop.betterThanShare).toBeLessThanOrEqual(1);
        }
        if (crop.harvestKg !== null) expect(crop.yieldTPerHa).toBeGreaterThan(0);
      }
    });

    it("ouvre à l'agent ses parcelles et cache les autres comme inconnues", async () => {
      await expect(getParcelInspection(agent, agentParcel.id)).resolves.not.toBeNull();
      await expect(getParcelInspection(agent, foreignParcel.id)).resolves.toBeNull();
    });

    it("ouvre au producteur ses parcelles seulement", async () => {
      const own = await getParcelInspection(farmer, farmerParcel.id);
      expect(own).not.toBeNull();
      await expect(getParcelInspection(farmer, foreignParcel.id)).resolves.toBeNull();
    });

    it("répond comme pour une parcelle inconnue à un identifiant qui n'existe pas", async () => {
      await expect(
        getParcelInspection(ministry, "00000000-0000-7000-8000-000000000000"),
      ).resolves.toBeNull();
    });
  });
});
