import "dotenv/config";
import { prisma } from "@/database/client";
import { getServerEnv } from "@/lib/env";
import { importFireArchive, lastCompleteSeason } from "@/modules/fires";

// Saison de feux passée (ADR-0039), sans rejouer l'ingestion ni lever d'alerte :
//   pnpm db:reference:fires-archive                 dernière saison sèche terminée
//   pnpm db:reference:fires-archive --season 2025   novembre 2025 à avril 2026
//   pnpm db:reference:fires-archive --dry-run       lit et compte, n'écrit rien
// Avec FIRMS_MAP_KEY : API FIRMS, par tranches de 5 jours. Sans clé : archives annuelles
// publiques par pays ; si l'une manque, rien n'est écrit et la commande le dit. Idempotent.
// Sur le serveur, depuis l'image tools :
//   docker run --rm --network bais_default --env-file app.env <registre>/tools:<sha> \
//     pnpm db:reference:fires-archive --season 2025

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const env = getServerEnv();
  const season = Number(argument("season") ?? lastCompleteSeason(new Date()));
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error(`Saison invalide : ${argument("season")} (année de novembre attendue)`);
  }
  const result = await importFireArchive({
    season,
    mapKey: env.FIRMS_MAP_KEY ?? null,
    baseUrl: env.FIRMS_BASE_URL,
    dryRun: process.argv.includes("--dry-run"),
  });
  const label = `Saison ${season}-${season + 1} (${result.mode === "api" ? "API FIRMS" : "archives annuelles"})`;
  if (result.status === "missing") {
    console.error(`${label} : fichiers absents, rien n'est écrit.`);
    for (const path of result.missing) console.error(`  ${path}`);
    console.error("Sans clé, FIRMS ne publie l'année qu'après coup : définir FIRMS_MAP_KEY.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `${label} : ${result.fetched} détections lues en ${result.requests} requêtes, ` +
      `${result.outside} hors du Bénin écartées, ` +
      `${result.created} créées, ${result.merged} complétées, ${result.skipped} déjà connues` +
      (result.status === "dry-run" ? " (essai, rien n'est écrit)." : "."),
  );
  if (result.missing.length > 0) {
    console.warn(`Tranches sans jeu disponible : ${result.missing.join(", ")}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
