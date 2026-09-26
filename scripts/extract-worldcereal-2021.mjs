// Terres cultivées 2021 (ESA WorldCereal, cultures temporaires) sur le Bénin, pour la carte : lecture
// fenêtrée des COG publics de Digital Earth Africa (niveau réduit d'environ 74 m), mosaïque des
// zones agro-écologiques, découpe au contour du Bénin, reprojection en Web Mercator et quatre
// quarts PNG à palette, comme la carte des cultures. Rien n'est téléchargé en entier.
//
// Usage, depuis un dossier temporaire hors du dépôt (npm i geotiff@2 sharp@0.34) :
//   node extract-worldcereal-2021.mjs <dossier de sortie> <contour du Bénin en GeoJSON>
// Le contour s'exporte de la base : SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(
//   ST_Union(geom::geometry), 0.002), 5) FROM departement;
// Source : catalogue STAC de Digital Earth Africa, produit esa_worldcereal_temporarycrops (2021,
// licence CC BY 4.0). Le 26/09/2026 : 34,7 Mo lus, quatre images de 1,2 Mo en tout.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fromUrl } from "geotiff";

const sharp = createRequire(import.meta.url)("sharp");

const [outDir, outlinePath] = process.argv.slice(2);
const color = "#b8327a";
const STAC_SEARCH =
  "https://explorer.digitalearth.africa/stac/search?collections=esa_worldcereal_temporarycrops" +
  "&bbox=0.6,5.9,4.0,12.5&limit=100";
const BOUNDS = [0.6, 5.9, 4.0, 12.5];
const LEVEL = 3;
const NODATA = 255;
const CROP = 100;
const [minLon, minLat, maxLon, maxLat] = BOUNDS;

// Octets reçus, pour tenir la limite de 500 Mo fixée par le chef d'équipe.
let received = 0;
const nativeFetch = globalThis.fetch;
// Trois essais : le serveur de Digital Earth Africa coupe parfois une requête.
globalThis.fetch = async (...args) => {
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await nativeFetch(...args);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  received += Number(response.headers.get("content-length") ?? 0);
  if (received > 450e6) throw new Error("Plus de 450 Mo reçus : arrêt");
  return response;
};

const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitudeOf = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
const toHttps = (href) =>
  href.replace(
    "s3://deafrica-input-datasets/",
    "https://deafrica-input-datasets.s3.af-south-1.amazonaws.com/",
  );

const stac = await (await nativeFetch(STAC_SEARCH)).json();
// La zone ouest-africaine d'abord : elle couvre presque tout le pays.
const items = stac.features
  .map((feature) => feature.assets.classification.href)
  .sort((a, b) => Number(b.includes("/32121/")) - Number(a.includes("/32121/")));

const probe = await fromUrl(toHttps(items[0]));
const probeFull = await probe.getImage(0);
const pixelDeg =
  (Math.abs(probeFull.getResolution()[0]) * probeFull.getWidth()) /
  (await probe.getImage(LEVEL)).getWidth();
const width = Math.round((maxLon - minLon) / pixelDeg);
const yTop = mercatorY(maxLat);
const yBottom = mercatorY(minLat);
const height = Math.round(((yTop - yBottom) * 180) / Math.PI / pixelDeg);
console.log("sortie", width, "x", height, "pixel", pixelDeg.toFixed(6), "deg");

const out = new Uint8Array(width * height).fill(NODATA);
const lonOf = new Float64Array(width);
for (let i = 0; i < width; i += 1) lonOf[i] = minLon + ((i + 0.5) * (maxLon - minLon)) / width;
const latOf = new Float64Array(height);
for (let j = 0; j < height; j += 1) {
  latOf[j] = latitudeOf(yTop - ((j + 0.5) * (yTop - yBottom)) / height);
}

for (const href of items) {
  const tiff = await fromUrl(toHttps(href));
  const full = await tiff.getImage(0);
  const image = await tiff.getImage(LEVEL);
  const [x0, y0] = full.getOrigin();
  const res = (Math.abs(full.getResolution()[0]) * full.getWidth()) / image.getWidth();
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const px0 = clamp(Math.floor((minLon - x0) / res), image.getWidth());
  const px1 = clamp(Math.ceil((maxLon - x0) / res), image.getWidth());
  const py0 = clamp(Math.floor((y0 - maxLat) / res), image.getHeight());
  const py1 = clamp(Math.ceil((y0 - minLat) / res), image.getHeight());
  if (px1 <= px0 || py1 <= py0) continue;
  const [data] = await image.readRasters({ window: [px0, py0, px1, py1], samples: [0] });
  const windowWidth = px1 - px0;
  for (let j = 0; j < height; j += 1) {
    const sy = Math.floor((y0 - latOf[j]) / res) - py0;
    if (sy < 0 || sy >= py1 - py0) continue;
    for (let i = 0; i < width; i += 1) {
      if (out[j * width + i] !== NODATA) continue;
      const sx = Math.floor((lonOf[i] - x0) / res) - px0;
      if (sx < 0 || sx >= windowWidth) continue;
      const value = data[sy * windowWidth + sx];
      if (value !== NODATA) out[j * width + i] = value;
    }
  }
  console.log(href.split("/").slice(-1)[0], "lu");
}
console.log("reçu", (received / 1e6).toFixed(1), "Mo");

// Contour du Bénin (union des départements) : rien n'est dessiné chez les voisins.
const outline = JSON.parse(readFileSync(outlinePath, "utf8"));
const polygons = outline.type === "MultiPolygon" ? outline.coordinates : [outline.coordinates];
const rings = polygons.flat();
const dx = (maxLon - minLon) / width;
let inBenin = 0;
for (let j = 0; j < height; j += 1) {
  const lat = latOf[j];
  const crossings = [];
  for (const ring of rings) {
    for (let k = 0; k < ring.length - 1; k += 1) {
      const [xa, ya] = ring[k];
      const [xb, yb] = ring[k + 1];
      if ((ya <= lat && lat < yb) || (yb <= lat && lat < ya)) {
        crossings.push(xa + ((lat - ya) * (xb - xa)) / (yb - ya));
      }
    }
  }
  crossings.sort((p, q) => p - q);
  const inside = new Uint8Array(width);
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    const from = Math.max(0, Math.ceil((crossings[k] - minLon) / dx - 0.5));
    const to = Math.min(width - 1, Math.floor((crossings[k + 1] - minLon) / dx - 0.5));
    for (let i = from; i <= to; i += 1) inside[i] = 1;
  }
  for (let i = 0; i < width; i += 1) {
    if (inside[i]) inBenin += 1;
    else out[j * width + i] = NODATA;
  }
}

const [r, g, b] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
const halfW = Math.floor(width / 2);
const halfH = Math.floor(height / 2);
const quarters = [
  [0, 0, halfW, halfH],
  [halfW, 0, width, halfH],
  [0, halfH, halfW, height],
  [halfW, halfH, width, height],
];
mkdirSync(outDir, { recursive: true });
let cropPixels = 0;
let total = 0;
for (const [index, [x0, y0, x1, y1]] of quarters.entries()) {
  const w = x1 - x0;
  const h = y1 - y0;
  const rgba = Buffer.alloc(w * h * 4);
  for (let j = y0; j < y1; j += 1) {
    for (let i = x0; i < x1; i += 1) {
      if (out[j * width + i] !== CROP) continue;
      const offset = ((j - y0) * w + (i - x0)) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
      cropPixels += 1;
    }
  }
  const buffer = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png({ palette: true, colors: 2, compressionLevel: 9, effort: 10 })
    .toBuffer();
  writeFileSync(`${outDir}/q${index}.png`, buffer);
  total += buffer.length;
  console.log(`q${index}.png`, w, "x", h, `${(buffer.length / 1024).toFixed(0)} ko`);
}
console.log("total", `${(total / 1024).toFixed(0)} ko`);
console.log(
  "pixels au Bénin",
  inBenin,
  "dont cultivés",
  cropPixels,
  `(${((100 * cropPixels) / inBenin).toFixed(1)} %)`,
);
