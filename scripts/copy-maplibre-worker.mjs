import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Le worker de MapLibre doit être servi comme fichiers statiques : avec Next.js, le bundler ne
// peut pas l'exposer lui-même. Le worker importe maplibre-gl-shared.mjs par chemin relatif,
// donc les deux fichiers sont copiés côte à côte dans public/vendor (ignoré par Git).
// Branché sur prebuild et predev ; postinstall seul n'est pas fiable (installation sans travail,
// --ignore-scripts).
const require = createRequire(import.meta.url);
const distDir = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");
const targetDir = path.join(process.cwd(), "public/vendor");
await mkdir(targetDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.join(distDir, file), path.join(targetDir, file));
  console.log(`public/vendor/${file}`);
}
