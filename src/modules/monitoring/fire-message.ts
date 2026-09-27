// Alerte « feu de brousse » adressée à un producteur (ADR-0022) : où est le feu par rapport à SA
// parcelle, quand le satellite l'a vu, deux gestes concrets, le numéro des sapeurs-pompiers et la
// limite honnête de la détection. Sans accès à la base : le calcul du feu le plus proche est fait
// par database/sql/fires.sql.ts (nearestFiresForFarms).

/** Sous cette distance d'une parcelle, un feu est une urgence : l'alerte passe les heures calmes. */
export const FIRE_CRITICAL_DISTANCE_M = 500;
/** Sapeurs-pompiers du Bénin, numéro national (chaque commune a aussi le sien). */
export const FIREFIGHTERS_NUMBER = "118";

export type FireSeverity = "WARNING" | "CRITICAL";

export interface LatLon {
  lat: number;
  lon: number;
}

/** Feu le plus proche d'une exploitation, vu depuis la parcelle la plus exposée. */
export interface FireExposure {
  /** Distance du feu au bord de la parcelle (à son centre si elle n'a pas de contour), en mètres. */
  distanceM: number;
  parcel: LatLon;
  fire: LatLon;
  detectedAt: Date;
  /** Culture de la campagne ouverte sur cette parcelle, en français (« Maïs »), ou null. */
  cropName: string | null;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Cap initial en degrés du point `from` vers le point `to` : 0 au nord, 90 à l'est. */
export function bearingDegrees(from: LatLon, to: LatLon): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const DIRECTIONS = [
  "au nord",
  "au nord-est",
  "à l'est",
  "au sud-est",
  "au sud",
  "au sud-ouest",
  "à l'ouest",
  "au nord-ouest",
] as const;

/** Direction en huit secteurs, telle qu'on la dit : « au nord-est », « à l'ouest ». */
export function directionFr(bearing: number): string {
  const sector = Math.round((((bearing % 360) + 360) % 360) / 45) % DIRECTIONS.length;
  return DIRECTIONS[sector] ?? DIRECTIONS[0];
}

/**
 * Distance comme on la dit, sans fausse précision (position du feu à quelques centaines de mètres
 * près) : arrondie à 100 m sous le kilomètre, au dixième de kilomètre au-delà.
 */
export function distanceFr(meters: number): string {
  if (meters < 100) return "moins de 100 m";
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `environ ${rounded} m`;
  return `environ ${(rounded / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Gravité pour un producteur selon la distance du feu à sa parcelle. */
export function fireSeverity(distanceM: number): FireSeverity {
  return distanceM < FIRE_CRITICAL_DISTANCE_M ? "CRITICAL" : "WARNING";
}

const beninClock = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Porto-Novo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const beninDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Porto-Novo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Heure du Bénin, « 14 h 05 ». */
function clockFr(date: Date): string {
  const parts = beninClock.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${Number(hour)} h ${minute}`;
}

/** Moment du passage du satellite, heure du Bénin : « aujourd'hui à 14 h 05 », « hier à 23 h 40 ». */
export function passageFr(detectedAt: Date, now: Date): string {
  const day = beninDay.format(detectedAt);
  const today = beninDay.format(now);
  const yesterday = beninDay.format(new Date(now.getTime() - 86_400_000));
  const clock = clockFr(detectedAt);
  if (day === today) return `aujourd'hui à ${clock}`;
  if (day === yesterday) return `hier à ${clock}`;
  const [, month, date] = day.split("-");
  return `le ${date}/${month} à ${clock}`;
}

/** « votre champ de maïs », « votre champ d'igname », ou « votre champ ». */
export function fieldFr(cropName: string | null): string {
  if (!cropName) return "votre champ";
  const crop = cropName.trim().toLocaleLowerCase("fr-FR");
  return /^[aeiouyàâäéèêëîïôöûüœ]/.test(crop) ? `votre champ d'${crop}` : `votre champ de ${crop}`;
}

/** Où est le feu : « environ 600 m au nord-est de votre champ de maïs ». */
export function fireWhereFr(exposure: FireExposure): string {
  const direction = directionFr(bearingDegrees(exposure.parcel, exposure.fire));
  return `${distanceFr(exposure.distanceM)} ${direction} de ${fieldFr(exposure.cropName)}`;
}

const HONEST_NOTE =
  "Détecté par satellite, à vérifier sur place : ce peut être un brûlage contrôlé.";

/**
 * Texte de l'alerte dans l'application, pour le producteur : où et quand, puis la limite de la
 * détection. Les gestes et le 118 sont dans le conseil de l'alerte, affiché à côté.
 */
export function fireMessageInApp(exposure: FireExposure, now: Date): string {
  return `Un feu est détecté à ${fireWhereFr(exposure)}, au passage du satellite ${passageFr(
    exposure.detectedAt,
    now,
  )}. ${HONEST_NOTE}`;
}

/** Message WhatsApp : où, quand, quoi faire, qui appeler, et ce que vaut la détection. */
export function fireMessageWhatsApp(exposure: FireExposure, now: Date): string {
  const urgent = fireSeverity(exposure.distanceM) === "CRITICAL";
  return [
    `BAIS, alerte feu${urgent ? " urgente" : ""} : un feu est détecté à ${fireWhereFr(exposure)}, au passage du satellite ${passageFr(exposure.detectedAt, now)}.`,
    "Si c'est sans danger, coupez un pare-feu autour du champ et des greniers, et prévenez vos voisins.",
    `Si le feu menace, appelez les sapeurs-pompiers au ${FIREFIGHTERS_NUMBER}.`,
    HONEST_NOTE,
  ].join("\n");
}

/** SMS : 160 caractères au plus, l'essentiel seulement. */
export function fireMessageSms(exposure: FireExposure): string {
  const direction = directionFr(bearingDegrees(exposure.parcel, exposure.fire));
  const text = `BAIS : feu à ${distanceFr(exposure.distanceM)} ${direction} de votre champ (satellite, ${clockFr(exposure.detectedAt)}). Pare-feu, prévenez vos voisins. Pompiers : ${FIREFIGHTERS_NUMBER}. À vérifier sur place.`;
  return text.length <= 160 ? text : `${text.slice(0, 159).trimEnd()}.`;
}
