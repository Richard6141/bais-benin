import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/satellite/[layer]/[period]/[...tile]/route";
import { prisma } from "@/database/client";
import { recentPeriods } from "@/modules/satellite";

// Route des images de la vue du ciel (revue de sécurité des phases 0 à 2) : seules les couches
// déclarées passent, jamais une clé héritée de l'objet ; une tuile détaillée exige une session,
// avant tout appel au cache ou à Copernicus.

function call(layer: string, tile: string[], period = recentPeriods(new Date())[1]!) {
  const url = `http://localhost/api/satellite/${layer}/${period}/${tile.join("/")}`;
  return GET(new NextRequest(url), { params: Promise.resolve({ layer, period, tile }) });
}

describe("route des images satellite", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuse une couche qui n'est qu'une propriété héritée", async () => {
    for (const layer of ["constructor", "__proto__", "toString"]) {
      expect((await call(layer, ["overview.png"])).status).toBe(400);
    }
  });

  it("exige une session pour une tuile détaillée", async () => {
    expect((await call("ndvi", ["11", "1033", "965.png"])).status).toBe(401);
  });

  it("n'offre la carte des cultures que sur ses 12 derniers mois, en image d'ensemble", async () => {
    expect((await call("cultures", ["overview.png"])).status).toBe(400);
    expect((await call("ndvi", ["overview.png"], "12-mois")).status).toBe(400);
    expect((await call("cultures", ["11", "1033", "965.png"], "12-mois")).status).toBe(404);
  });
});
