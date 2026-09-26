import type {
  ParcelSeriesRequest,
  ParcelSeriesResult,
} from "@/services/ports/remote-sensing-provider";

// Séries de démonstration d'une parcelle (ADR-0030), sans compte Copernicus : une courbe de
// végétation typique de la culture annoncée, décalée par la vigueur de la commune et de la
// parcelle, bruitée, avec les nuages de la saison des pluies. Une parcelle non vérifiée sur douze
// montre la courbe d'une autre culture proche, comme une déclaration fausse : le modèle doit la
// repérer.

const DAY_MS = 86_400_000;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  return result >>> 0;
}

/** Nombre pseudo-aléatoire reproductible entre 0 et 1. */
function unit(seed: string): number {
  return hash(seed) / 0xffffffff;
}

function bump(day: number, peak: number, width: number): number {
  const distance = Math.min(Math.abs(day - peak), 365 - Math.abs(day - peak));
  return Math.exp(-((distance / width) ** 2));
}

function dayOfYear(time: number): number {
  const date = new Date(time);
  return Math.floor((time - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY_MS);
}

/** Confusions plausibles, pour les déclarations fausses de démonstration. */
const LOOKALIKE: Record<string, string> = {
  MAIZE: "SORGHUM_MILLET",
  SORGHUM_MILLET: "MAIZE",
  COTTON: "MAIZE",
  SOYBEAN: "LEGUMES_OILSEEDS",
  LEGUMES_OILSEEDS: "SOYBEAN",
  RICE: "MAIZE",
  ROOTS: "PERENNIAL",
  PERENNIAL: "ROOTS",
  VEGETABLES: "MAIZE",
};

interface Curve {
  ndvi: (day: number) => number;
  flooded: (day: number) => boolean;
}

function curveOf(group: string, latitude: number, shift: number, vigour: number): Curve {
  const north = latitude >= 9;
  const base = north ? 0.18 : 0.26;
  const lift = (height: number) => height * (1 + vigour);
  const dry = () => base;
  const at = (peak: number) => peak + shift;
  switch (group) {
    case "MAIZE":
      return {
        ndvi: north
          ? (day) => base + lift(0.52) * bump(day, at(225), 30)
          : (day) =>
              base + lift(0.44) * bump(day, at(170), 25) + lift(0.34) * bump(day, at(290), 22),
        flooded: () => false,
      };
    case "SORGHUM_MILLET":
      return { ndvi: (day) => base + lift(0.38) * bump(day, at(255), 34), flooded: () => false };
    case "RICE":
      return {
        ndvi: (day) =>
          day >= at(165) && day <= at(192) ? 0.14 : base + lift(0.55) * bump(day, at(240), 24),
        flooded: (day) => day >= at(165) && day <= at(192),
      };
    case "COTTON":
      return { ndvi: (day) => base + lift(0.52) * bump(day, at(265), 40), flooded: () => false };
    case "SOYBEAN":
      return { ndvi: (day) => base + lift(0.56) * bump(day, at(228), 20), flooded: () => false };
    case "LEGUMES_OILSEEDS":
      return { ndvi: (day) => base + lift(0.32) * bump(day, at(235), 22), flooded: () => false };
    case "ROOTS":
      return {
        ndvi: (day) => {
          const rise = Math.min(1, Math.max(0, (day - at(110)) / 60));
          const fall = Math.min(1, Math.max(0, (at(335) - day) / 45));
          return base + lift(0.4) * Math.min(rise, fall);
        },
        flooded: () => false,
      };
    case "PERENNIAL":
      return { ndvi: (day) => 0.5 + lift(0.1) * bump(day, at(230), 60), flooded: () => false };
    case "VEGETABLES":
      return {
        ndvi: (day) =>
          0.22 + lift(0.32) * bump(day, at(25), 12) + lift(0.3) * bump(day, at(70), 12),
        flooded: () => false,
      };
    default:
      return { ndvi: dry, flooded: () => false };
  }
}

// Part de décades couvertes par mois : saison des pluies très nuageuse, saison sèche claire.
const CLOUD = [0.05, 0.05, 0.1, 0.25, 0.4, 0.6, 0.7, 0.7, 0.6, 0.4, 0.2, 0.05];

export function syntheticParcelSeries(
  request: ParcelSeriesRequest,
  vigour: number,
): Omit<ParcelSeriesResult, "processingUnits"> {
  const key = request.demoKeys?.parcel ?? JSON.stringify(request.geometry.coordinates[0]?.[0]);
  const declared = request.expectedGroup ?? "MAIZE";
  const misdeclared = !request.verified && unit(`faux:${key}`) < 1 / 12;
  const group = misdeclared ? (LOOKALIKE[declared] ?? declared) : declared;
  const shift = Math.round((unit(`date:${key}`) - 0.5) * 20);
  const curve = curveOf(group, request.latitude, shift, vigour);
  const from = Date.parse(request.from);
  const to = Date.parse(request.to);

  const s2: ParcelSeriesResult["s2"] = [];
  for (let time = from; time < to; time += 10 * DAY_MS) {
    const middle = time + 5 * DAY_MS;
    const day = dayOfYear(middle);
    const cloudy = unit(`nuage:${key}:${time}`) < (CLOUD[new Date(middle).getUTCMonth()] ?? 0.3);
    const noise = (unit(`bruit:${key}:${time}`) - 0.5) * 0.06;
    const ndvi = Math.max(0.02, Math.min(0.9, curve.ndvi(day) + noise));
    const ndmi = curve.flooded(day) ? 0.32 + noise : 0.8 * ndvi - 0.2 + noise / 2;
    s2.push({
      from: new Date(time).toISOString(),
      to: new Date(Math.min(time + 10 * DAY_MS, to)).toISOString(),
      ndvi: cloudy ? null : Number(ndvi.toFixed(3)),
      ndmi: cloudy ? null : Number(ndmi.toFixed(3)),
      valid: cloudy ? 0 : Number((0.9 + unit(`part:${key}:${time}`) * 0.1).toFixed(3)),
    });
  }

  const s1: ParcelSeriesResult["s1"] = [];
  for (let time = from; time < to; time += 12 * DAY_MS) {
    const day = dayOfYear(time + 6 * DAY_MS);
    const noise = (unit(`radar:${key}:${time}`) - 0.5) * 1.6;
    const vh = curve.flooded(day) ? -22 + noise : -23 + 15 * curve.ndvi(day) + noise;
    s1.push({
      from: new Date(time).toISOString(),
      to: new Date(Math.min(time + 12 * DAY_MS, to)).toISOString(),
      vh: Number(vh.toFixed(2)),
      vv: Number((vh + 6 + (unit(`vv:${key}:${time}`) - 0.5)).toFixed(2)),
    });
  }
  return { s2, s1 };
}
