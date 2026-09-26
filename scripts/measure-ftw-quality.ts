// Mesure la qualité des contours de référence FTW face aux parcelles relevées au GPS de la base
// (ADR-0029). Lecture seule.   pnpm tsx scripts/measure-ftw-quality.ts [--year 2025]
import "dotenv/config";
import { prisma } from "../src/database/client";
import { measureReferenceQuality } from "../src/modules/reference-fields/quality";

async function main() {
  const index = process.argv.indexOf("--year");
  const year = index === -1 ? 2025 : Number(process.argv[index + 1]);
  const quality = await measureReferenceQuality({ year });
  const pct = (value: number | null) =>
    value === null ? "sans objet" : `${(value * 100).toFixed(1)} %`;
  console.log(`Parcelles relevées dans la zone couverte : ${quality.parcels}`);
  console.log(
    `Retrouvées (IoU ${quality.iouThreshold} et plus avec un seul champ) : ${quality.found} (${pct(quality.foundShare)})`,
  );
  console.log(`IoU médian : ${pct(quality.medianIou)}`);
  console.log(
    `Part médiane de la parcelle couverte par les champs : ${pct(quality.medianCoverage)}`,
  );
  await prisma.$disconnect();
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
