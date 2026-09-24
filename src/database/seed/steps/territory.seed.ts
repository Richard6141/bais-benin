import type { PrismaClient } from "@/generated/prisma/client";
import { AGRO_ECOLOGICAL_ZONES } from "../reference";
import { DEPARTEMENT_CHEF_LIEUX } from "../territory/commune-codes";
import { loadTerritoryDataset, type Geometry } from "../territory/load-geoboundaries";

// Date de publication du jeu geoBoundaries utilisé (voir raw/LICENCE.md).
const GEOBOUNDARIES_RELEASE_DATE = new Date("2023-12-12T00:00:00Z");

// Rattachement de phase 1 : la première zone qui liste le département.
// Le rattachement fin par commune viendra avec les géométries officielles des ZAE.
function primaryZoneCodeFor(departementIsoCode: string): string | null {
  const zone = AGRO_ECOLOGICAL_ZONES.find((z) =>
    (z.departementCodes as readonly string[]).includes(departementIsoCode),
  );
  return zone?.code ?? null;
}

// Les géométries passent par SQL : Prisma ne sait pas écrire une colonne geography.
// ST_Multi homogénéise Polygon et MultiPolygon ; ST_MakeValid corrige les auto-intersections
// résiduelles des contours simplifiés.
async function writeGeometry(
  prisma: PrismaClient,
  table: "departement" | "commune",
  id: string,
  geometry: Geometry,
) {
  const geoJson = JSON.stringify(geometry);
  if (table === "departement") {
    await prisma.$executeRaw`
      UPDATE "departement"
      SET "geom" = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326)))::geography,
          "centroid" = ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326))::geography,
          "area_km2" = ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326)::geography) / 1000000
      WHERE "id" = ${id}::uuid`;
  } else {
    await prisma.$executeRaw`
      UPDATE "commune"
      SET "geom" = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326)))::geography,
          "centroid" = ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326))::geography,
          "area_km2" = ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326)::geography) / 1000000
      WHERE "id" = ${id}::uuid`;
  }
}

export async function seedTerritory(
  prisma: PrismaClient,
): Promise<{ departements: number; communes: number }> {
  const dataset = await loadTerritoryDataset();
  const zones = await prisma.agroEcologicalZone.findMany({ select: { id: true, code: true } });
  const zoneIdByCode = new Map(zones.map((zone) => [zone.code, zone.id]));

  const provenance = {
    sourceId: "GEOBOUNDARIES",
    sourceDate: GEOBOUNDARIES_RELEASE_DATE,
    reliability: "OFFICIAL" as const,
  };

  const departementIdByIso = new Map<string, string>();
  for (const departement of dataset.departements) {
    const chefLieu = DEPARTEMENT_CHEF_LIEUX[departement.isoCode];
    if (!chefLieu) throw new Error(`Chef-lieu inconnu pour ${departement.isoCode}`);
    const data = {
      name: departement.name,
      chefLieu,
      geoboundariesId: departement.geoboundariesId,
      ...provenance,
    };
    const row = await prisma.departement.upsert({
      where: { code: departement.isoCode },
      create: { code: departement.isoCode, ...data },
      update: data,
      select: { id: true },
    });
    departementIdByIso.set(departement.isoCode, row.id);
    await writeGeometry(prisma, "departement", row.id, departement.geometry);
  }

  for (const commune of dataset.communes) {
    const departementId = departementIdByIso.get(commune.departementIsoCode);
    if (!departementId) throw new Error(`Département absent pour ${commune.name}`);
    const zoneCode = primaryZoneCodeFor(commune.departementIsoCode);
    const data = {
      name: commune.name,
      departementId,
      zoneId: zoneCode ? (zoneIdByCode.get(zoneCode) ?? null) : null,
      geoboundariesId: commune.geoboundariesId,
      ...provenance,
    };
    const row = await prisma.commune.upsert({
      where: { code: commune.code },
      create: { code: commune.code, aliases: aliasesFor(commune.name), ...data },
      update: data,
      select: { id: true },
    });
    await writeGeometry(prisma, "commune", row.id, commune.geometry);
  }

  await deriveDepartementGeometries(prisma);

  return { departements: dataset.departements.length, communes: dataset.communes.length };
}

// Les couches ADM1 et ADM2 de geoBoundaries proviennent de sources différentes et leurs
// contours divergent (jusqu'à 44 % de la surface d'une commune hors de son département).
// Pour que le territoire soit cohérent, la géométrie d'un département est l'union de ses
// communes ; le contour ADM1 d'origine ne sert plus que de repère lors des mises à jour.
async function deriveDepartementGeometries(prisma: PrismaClient) {
  await prisma.$executeRaw`
    UPDATE "departement" d
    SET "geom" = u.geom,
        "centroid" = ST_PointOnSurface(u.geom::geometry)::geography,
        "area_km2" = ST_Area(u.geom) / 1000000
    FROM (
      SELECT "departement_id",
             ST_Multi(ST_MakeValid(ST_Union("geom"::geometry)))::geography AS geom
      FROM "commune"
      WHERE "geom" IS NOT NULL AND "archived_at" IS NULL
      GROUP BY "departement_id"
    ) u
    WHERE u."departement_id" = d."id"`;
}

// Variantes d'écriture rencontrées dans les documents administratifs et sur le terrain.
const KNOWN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Sèmè-Kpodji": ["Sèmè-Podji", "Seme-Kpodji"],
  Cobly: ["Kobli"],
  Boukoumbé: ["Boukombé", "Boukombe"],
  "Akpro-Missérété": ["Akpro-Misserete"],
  "Dassa-Zoumè": ["Dassa"],
  "Abomey-Calavi": ["Calavi"],
};

function aliasesFor(name: string): string[] {
  return [...(KNOWN_ALIASES[name] ?? [])];
}
