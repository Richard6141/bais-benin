import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/database/client";
import {
  assignReferenceFieldCommunes,
  insertReferenceFields,
  FTW_SOURCE_ID,
  type ReferenceFieldInput,
} from "@/database/reference-fields-store";

// Extrait réel de Fields of The World autour de Djougou (zone pilote, environ 10 km, 2025) :
// 1 139 champs, confiance 69 et plus, 0,1 ha et plus. Versionné pour la démonstration et les tests ;
// l'import complet passe par scripts/import-ftw-fields.ts.
const FIXTURE = join(process.cwd(), "src/database/seed/reference/fixtures/ftw-djougou.json");

interface Fixture {
  features: {
    properties: { ref: string; year: number; confidence: number | null; areaM2: number };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }[];
}

export async function seedReferenceFields(): Promise<{ inserted: number; skipped: boolean }> {
  const existing = await prisma.referenceField.count({ where: { sourceId: FTW_SOURCE_ID } });
  if (existing > 0) return { inserted: 0, skipped: true };
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  const rows: ReferenceFieldInput[] = fixture.features.map((feature) => ({
    ref: feature.properties.ref,
    year: feature.properties.year,
    confidence: feature.properties.confidence,
    areaHa: feature.properties.areaM2 / 10_000,
    geometry: feature.geometry,
  }));
  const inserted = await insertReferenceFields(rows);
  await assignReferenceFieldCommunes();
  return { inserted, skipped: false };
}
