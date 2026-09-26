import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import reference from "../reference/population-worldpop.json";

// Population par commune (ADR-0035) : totaux WorldPop calculés hors ligne par
// scripts/aggregate-worldpop.mjs, chargés comme un référentiel. Une commune inconnue de la base
// est ignorée ; relancer le seed met les chiffres à jour sans doublon.

const referenceSchema = z.object({
  source: z.string(),
  dataset: z.string(),
  year: z.number().int(),
  communes: z.array(
    z.object({ code: z.string(), name: z.string(), population: z.number().int().min(0) }),
  ),
});

export async function seedCommunePopulation(prisma: PrismaClient): Promise<number> {
  const data = referenceSchema.parse(reference);
  const communes = new Map(
    (await prisma.commune.findMany({ select: { id: true, code: true } })).map((commune) => [
      commune.code,
      commune.id,
    ]),
  );
  let loaded = 0;
  for (const entry of data.communes) {
    const communeId = communes.get(entry.code);
    if (!communeId) continue;
    await prisma.communePopulation.upsert({
      where: {
        communeId_year_sourceId: { communeId, year: data.year, sourceId: data.source },
      },
      create: {
        communeId,
        year: data.year,
        population: entry.population,
        sourceId: data.source,
        dataset: data.dataset,
      },
      update: { population: entry.population, dataset: data.dataset },
    });
    loaded += 1;
  }
  return loaded;
}
