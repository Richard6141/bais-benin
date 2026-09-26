// Population par commune (ADR-0035) : additionne le raster WorldPop Global2 du Bénin (estimation
// contrainte à 100 m) sur le contour de chaque commune, pixel par pixel (un pixel compte pour la
// commune qui contient son centre). Le raster reste hors du dépôt ; le résultat, 77 totaux, est le
// référentiel src/database/seed/reference/population-worldpop.json.
//
// Usage, depuis un dossier temporaire hors du dépôt (npm i geotiff@2) :
//   node aggregate-worldpop.mjs <raster.tif> <communes.geojson> <année> <sortie.json>
// Raster : https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/<année>/BEN/v1/100m/
//   constrained/ben_pop_<année>_CN_100m_R2025A_v1.tif (licence CC BY 4.0).
// Communes : SELECT code, name, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom::geometry, 0.0005), 6)
//   FROM commune, mises en FeatureCollection avec code et name en propriétés.
import { readFileSync, writeFileSync } from "node:fs";
import { fromFile } from "geotiff";

const [rasterPath, communesPath, year, outputPath] = process.argv.slice(2);
const tiff = await fromFile(rasterPath);
const image = await tiff.getImage();
const width = image.getWidth();
const height = image.getHeight();
const [originX, originY] = image.getOrigin();
const [resX, resY] = image.getResolution();
const noData = image.getGDALNoData();
const [values] = await image.readRasters({ samples: [0] });
const valid = (value) => Number.isFinite(value) && value > 0 && value !== noData;

let national = 0;
for (const value of values) if (valid(value)) national += value;

const communes = JSON.parse(readFileSync(communesPath, "utf8")).features;
const result = [];
let assigned = 0;
for (const feature of communes) {
  const polygons =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  const rings = polygons.flat();
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [, lat] of ring) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  const rowFrom = Math.max(0, Math.floor((maxLat - originY) / resY));
  const rowTo = Math.min(height - 1, Math.ceil((minLat - originY) / resY));
  let population = 0;
  for (let row = rowFrom; row <= rowTo; row += 1) {
    const lat = originY + (row + 0.5) * resY;
    const crossings = [];
    for (const ring of rings) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const [xa, ya] = ring[index];
        const [xb, yb] = ring[index + 1];
        if ((ya <= lat && lat < yb) || (yb <= lat && lat < ya)) {
          crossings.push(xa + ((lat - ya) * (xb - xa)) / (yb - ya));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.max(0, Math.ceil((crossings[index] - originX) / resX - 0.5));
      const to = Math.min(width - 1, Math.floor((crossings[index + 1] - originX) / resX - 0.5));
      for (let column = from; column <= to; column += 1) {
        const value = values[row * width + column];
        if (!valid(value)) continue;
        population += value;
      }
    }
  }
  assigned += population;
  result.push({
    code: feature.properties.code,
    name: feature.properties.name,
    population: Math.round(population),
  });
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      source: "WORLDPOP",
      dataset: "WorldPop Global2 R2025A v1, estimation contrainte à 100 m",
      year: Number(year),
      licence: "CC BY 4.0",
      extractedOn: new Date().toISOString().slice(0, 10),
      doi: "10.5258/SOTON/WP00839",
      url: `https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/${year}/BEN/v1/100m/constrained/ben_pop_${year}_CN_100m_R2025A_v1.tif`,
      nationalTotal: Math.round(national),
      communes: result,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `${result.length} communes, ${Math.round(assigned)} habitants attribués sur ${Math.round(national)} (${((100 * assigned) / national).toFixed(2)} %)`,
);
