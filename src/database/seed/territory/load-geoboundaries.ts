import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEPARTEMENT_ISO_BY_NAME, assignCommuneCodes } from "./commune-codes";

// Charge les couches geoBoundaries (ADM1 départements, ADM2 communes) et la table de
// correspondance orthographique produite à partir de docs/08 §2.1. Les libellés officiels
// remplacent les shapeName de geoBoundaries, sans accents dans la source.

const rawDirectory = path.join(process.cwd(), "src/database/seed/territory/raw");

const positionSchema = z.tuple([z.number(), z.number()]);
const ringSchema = z.array(positionSchema);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ringSchema) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ringSchema)) }),
]);

const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      properties: z.object({
        shapeName: z.string(),
        shapeISO: z.string().nullable().optional(),
        shapeID: z.string(),
      }),
      geometry: geometrySchema,
    }),
  ),
});

const correspondanceSchema = z.object({
  source: z.string(),
  departements: z.array(
    z.object({
      shapeID: z.string(),
      shapeISO: z.string().nullable(),
      libelle_officiel: z.string(),
    }),
  ),
  communes: z.array(
    z.object({
      shapeID: z.string(),
      libelle_officiel: z.string(),
      departement: z.string(),
    }),
  ),
});

export type Geometry = z.infer<typeof geometrySchema>;

export interface DepartementRecord {
  isoCode: string;
  name: string;
  geoboundariesId: string;
  geometry: Geometry;
}

export interface CommuneRecord {
  code: string;
  name: string;
  departementIsoCode: string;
  geoboundariesId: string;
  geometry: Geometry;
}

export interface TerritoryDataset {
  sourceLabel: string;
  departements: DepartementRecord[];
  communes: CommuneRecord[];
}

async function readJson(fileName: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rawDirectory, fileName), "utf-8"));
}

export async function loadTerritoryDataset(): Promise<TerritoryDataset> {
  const [adm1, adm2, correspondance] = await Promise.all([
    readJson("geoboundaries-ben-adm1.geojson").then((raw) => featureCollectionSchema.parse(raw)),
    readJson("geoboundaries-ben-adm2.geojson").then((raw) => featureCollectionSchema.parse(raw)),
    readJson("correspondance-communes.json").then((raw) => correspondanceSchema.parse(raw)),
  ]);

  const departements = correspondance.departements.map((entry) => {
    const feature = adm1.features.find((f) => f.properties.shapeID === entry.shapeID);
    if (!feature) throw new Error(`Géométrie ADM1 introuvable pour ${entry.libelle_officiel}`);
    const isoCode = DEPARTEMENT_ISO_BY_NAME[entry.libelle_officiel];
    if (!isoCode) throw new Error(`Code ISO inconnu pour ${entry.libelle_officiel}`);
    return {
      isoCode,
      name: entry.libelle_officiel,
      geoboundariesId: entry.shapeID,
      geometry: feature.geometry,
    } satisfies DepartementRecord;
  });

  const isoByDepartementName = new Map(departements.map((d) => [d.name, d.isoCode]));

  // Les codes se calculent par département, dans l'ordre alphabétique des libellés officiels.
  const communesByDepartement = new Map<string, Array<Omit<CommuneRecord, "code">>>();
  for (const entry of correspondance.communes) {
    const feature = adm2.features.find((f) => f.properties.shapeID === entry.shapeID);
    if (!feature) throw new Error(`Géométrie ADM2 introuvable pour ${entry.libelle_officiel}`);
    const isoCode = isoByDepartementName.get(entry.departement);
    if (!isoCode) throw new Error(`Département inconnu pour ${entry.libelle_officiel}`);
    const list = communesByDepartement.get(isoCode) ?? [];
    list.push({
      name: entry.libelle_officiel,
      departementIsoCode: isoCode,
      geoboundariesId: entry.shapeID,
      geometry: feature.geometry,
    });
    communesByDepartement.set(isoCode, list);
  }

  const communes = [...communesByDepartement.entries()].flatMap(([isoCode, list]) =>
    assignCommuneCodes(isoCode, list),
  );

  return { sourceLabel: correspondance.source, departements, communes };
}
