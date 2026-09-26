// Lecture d'un fichier de statistiques officielles (ADR-0034), en fonction pure : colonnes,
// cultures par code ou nom français, territoires par code, indicateurs, nombres à la française.
// Tout ou rien : chaque erreur est rendue avec son numéro de ligne.

export const MAX_ROWS = 20_000;
export const MAX_BYTES = 2_000_000;

export type OfficialMetric = "AREA_HA" | "PRODUCTION_T" | "YIELD_T_HA";
export type OfficialLevel = "NATIONAL" | "DEPARTEMENT" | "COMMUNE";

export interface OfficialRow {
  line: number;
  sourceId: string;
  campaignCode: string;
  territoryCode: string;
  level: OfficialLevel;
  cropCode: string;
  metric: OfficialMetric;
  value: number;
  reference: string | null;
}

export interface CsvLookups {
  /** Nom ou code normalisé de culture, vers le code du registre. */
  crops: ReadonlyMap<string, string>;
  /** Code de territoire vers son niveau ; « BJ » pour le pays. */
  territories: ReadonlyMap<string, OfficialLevel>;
}

export type ParseResult =
  { ok: true; rows: OfficialRow[] } | { ok: false; errors: { line: number; message: string }[] };

const REQUIRED = ["source", "campagne", "territoire", "culture", "indicateur", "valeur"] as const;

const SOURCES = new Map([
  ["maep_dsa", "MAEP_DSA"],
  ["dsa", "MAEP_DSA"],
  ["maep", "MAEP_DSA"],
  ["faostat", "FAOSTAT"],
  ["fao", "FAOSTAT"],
]);

const METRICS = new Map<string, OfficialMetric>([
  ["superficie_ha", "AREA_HA"],
  ["surface_ha", "AREA_HA"],
  ["superficie", "AREA_HA"],
  ["production_t", "PRODUCTION_T"],
  ["production", "PRODUCTION_T"],
  ["rendement_t_ha", "YIELD_T_HA"],
  ["rendement", "YIELD_T_HA"],
]);

/** Bornes de vraisemblance : le Bénin couvre environ 11,5 millions d'hectares. */
const LIMITS: Record<OfficialMetric, number> = {
  AREA_HA: 12_000_000,
  PRODUCTION_T: 50_000_000,
  YIELD_T_HA: 100,
};

/** Minuscules, sans accents ni espaces superflus, apostrophes et tirets en espaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Noms usuels des statistiques agricoles qui ne sont pas le nom du registre. */
export const CROP_ALIASES: Record<string, string> = {
  mais: "MAIZE",
  "riz paddy": "RICE",
  paddy: "RICE",
  "coton graine": "COTTON",
  "noix de cajou": "CASHEW",
  cajou: "CASHEW",
  "palmier a huile": "OIL_PALM",
  plantain: "PLANTAIN",
  haricot: "COWPEA",
  "arachide coque": "GROUNDNUT",
};

/** Une ligne CSV, guillemets doubles compris (« "1 234,5" »). */
function splitLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Nombre écrit à la française ou à l'anglaise : « 1 234,5 », « 1234.5 ». */
export function parseNumber(text: string): number | null {
  const compact = text.replace(/[\s  ]/g, "");
  if (!/^\d+([.,]\d+)?$/.test(compact)) return null;
  return Number(compact.replace(",", "."));
}

function validCampaign(code: string): boolean {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(code);
  if (!match) return false;
  return !match[2] || Number(match[2]) === Number(match[1]) + 1;
}

export function parseOfficialCsv(text: string, lookups: CsvLookups): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0] ?? "";
  const separator =
    (header.match(/;/g) ?? []).length > (header.match(/,/g) ?? []).length ? ";" : ",";
  const columns = splitLine(header, separator).map(normalize);
  const missing = REQUIRED.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [{ line: 1, message: `Colonnes manquantes : ${missing.join(", ")}` }],
    };
  }
  const at = (cells: string[], name: string) => cells[columns.indexOf(name)] ?? "";
  const rows: OfficialRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Map<string, number>();
  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index]!;
    if (raw.trim() === "") continue;
    const line = index + 1;
    if (rows.length + errors.length >= MAX_ROWS) {
      errors.push({ line, message: `Plus de ${MAX_ROWS} lignes : coupez le fichier` });
      break;
    }
    const cells = splitLine(raw, separator);
    const problems: string[] = [];
    const sourceId = SOURCES.get(normalize(at(cells, "source")).replace(/ /g, "_"));
    if (!sourceId) problems.push(`source inconnue « ${at(cells, "source")} » (DSA ou FAOSTAT)`);
    const campaignCode = at(cells, "campagne");
    if (!validCampaign(campaignCode)) {
      problems.push(`campagne « ${campaignCode} » attendue sous la forme 2024-2025 ou 2024`);
    }
    const territoryCode = at(cells, "territoire").toUpperCase();
    const level = lookups.territories.get(territoryCode);
    if (!level) problems.push(`territoire inconnu « ${at(cells, "territoire")} »`);
    const cropName = normalize(at(cells, "culture"));
    const cropCode =
      lookups.crops.get(cropName) ??
      CROP_ALIASES[cropName] ??
      lookups.crops.get(cropName.replace(/ /g, "_"));
    if (!cropCode) problems.push(`culture inconnue « ${at(cells, "culture")} »`);
    const metric = METRICS.get(normalize(at(cells, "indicateur")).replace(/ /g, "_"));
    if (!metric) {
      problems.push(
        `indicateur « ${at(cells, "indicateur")} » attendu : superficie_ha, production_t ou rendement_t_ha`,
      );
    }
    const value = parseNumber(at(cells, "valeur"));
    if (value === null) problems.push(`valeur « ${at(cells, "valeur")} » non numérique`);
    else if (metric && value > LIMITS[metric])
      problems.push(`valeur ${at(cells, "valeur")} invraisemblable`);
    if (problems.length > 0) {
      errors.push({ line, message: problems.join(" ; ") });
      continue;
    }
    const key = [sourceId, campaignCode, territoryCode, cropCode, metric].join("|");
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ line, message: `même chiffre qu'à la ligne ${first}` });
      continue;
    }
    seen.set(key, line);
    const reference = columns.includes("reference") ? at(cells, "reference") : "";
    rows.push({
      line,
      sourceId: sourceId!,
      campaignCode,
      territoryCode,
      level: level!,
      cropCode: cropCode!,
      metric: metric!,
      value: value!,
      reference: reference === "" ? null : reference.slice(0, 200),
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0)
    return { ok: false, errors: [{ line: 2, message: "Aucune ligne de données" }] };
  return { ok: true, rows };
}
