// Convertit l'extrait FAOSTAT QCL (Afrique, format large) au format d'import de BAIS (ADR-0034) :
// Bénin, cultures du registre, surface récoltée, production et rendement, de 2015 à la dernière
// année publiée. Le fichier produit reste hors du dépôt.
//
// Usage : node scripts/convert-faostat-qcl.mjs <Production_Crops_Livestock_E_Africa.csv> <sortie.csv> <date de consultation>
// Extrait public : https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_Africa.zip
// Licence CC BY 4.0 : citer « FAO. <année de mise à jour>. FAOSTAT: Crops and livestock products (QCL).
// Accessed on <date>. https://www.fao.org/faostat/en/#data/QCL. Licence: CC-BY-4.0. »
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [input, output, accessed] = process.argv.slice(2);

const ITEMS = new Map([
  ["56", "MAIZE"],
  ["83", "SORGHUM"],
  ["79", "MILLET"],
  ["27", "RICE"],
  ["328", "COTTON"],
  ["236", "SOYBEAN"],
  ["195", "COWPEA"],
  ["242", "GROUNDNUT"],
  ["289", "SESAME"],
  ["137", "YAM"],
  ["125", "CASSAVA"],
  ["122", "SWEET_POTATO"],
  ["217", "CASHEW"],
  ["254", "OIL_PALM"],
  ["263", "SHEA"],
  ["489", "PLANTAIN"],
  ["574", "PINEAPPLE"],
  ["388", "TOMATO"],
  ["401", "CHILI"],
  ["430", "OKRA"],
  ["403", "ONION"],
]);
const ELEMENTS = new Map([
  ["5312", { metric: "superficie_ha", unit: "ha", factor: 1 }],
  ["5510", { metric: "production_t", unit: "t", factor: 1 }],
  ["5412", { metric: "rendement_t_ha", unit: "kg/ha", factor: 0.001 }],
]);
const FLAGS = {
  A: "chiffre officiel",
  E: "estimation",
  I: "imputé par la FAO",
  X: "organisme externe",
};
const FIRST_YEAR = 2015;

function split(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else current += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cells.push(current);
      current = "";
    } else current += c;
  }
  cells.push(current);
  return cells;
}

const rl = createInterface({ input: createReadStream(input, "utf8") });
let header = null;
const out = ["source;campagne;territoire;culture;indicateur;valeur;reference"];
const seenItems = new Map();
let lastYear = 0;
for await (const line of rl) {
  const cells = split(line);
  if (!header) {
    header = cells;
    continue;
  }
  if (cells[2] !== "Benin") continue;
  const crop = ITEMS.get(cells[3]);
  const element = ELEMENTS.get(cells[6]);
  if (!crop || !element) continue;
  if (cells[8] !== element.unit) throw new Error(`unité inattendue ${cells[8]} pour ${cells[5]}`);
  seenItems.set(crop, cells[5]);
  for (let index = 9; index < header.length; index += 3) {
    const year = Number(header[index].slice(1));
    if (year < FIRST_YEAR) continue;
    const raw = cells[index];
    const flag = cells[index + 1] ?? "";
    if (raw === "" || flag === "M") continue;
    const value = Number(raw) * element.factor;
    if (!Number.isFinite(value) || value < 0) continue;
    lastYear = Math.max(lastYear, year);
    const quality = FLAGS[flag] ? `, ${FLAGS[flag]} (${flag})` : "";
    const rounded = element.factor === 1 ? String(Math.round(value)) : value.toFixed(3);
    out.push(
      [
        "FAOSTAT",
        String(year),
        "BJ",
        crop,
        element.metric,
        rounded,
        `FAOSTAT QCL ${cells[5].replace(/;/g, ",")}${quality}, consulté le ${accessed}`,
      ].join(";"),
    );
  }
}
writeFileSync(output, `${out.join("\n")}\n`, "utf8");
console.log(`${out.length - 1} lignes, ${seenItems.size} cultures, de ${FIRST_YEAR} à ${lastYear}`);
const missing = [...ITEMS.values()].filter((crop) => !seenItems.has(crop));
console.log("cultures absentes :", missing.join(", ") || "aucune");
for (const [crop, name] of seenItems) console.log(`  ${crop} <- ${name}`);
