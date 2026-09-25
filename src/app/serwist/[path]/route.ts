import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Le service worker est compilé à la demande par Serwist et servi sur /serwist/sw.js.
// La révision (commit courant) invalide la page hors-ligne précachée à chaque version.
const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim();
const revision = gitRevision && gitRevision.length > 0 ? gitRevision : crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    // La page de repli /hors-ligne est précachée à l'installation avec la révision du commit ;
    // `fallbacks` (sw.ts) la sert depuis ce précache quand une navigation échoue.
    additionalPrecacheEntries: [{ url: "/hors-ligne", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
