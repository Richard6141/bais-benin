import type { SyncCommandType } from "@/modules/sync/commands";

// Libellés français des objets du registre côté agent. Un seul endroit pour que la fiche,
// la file de synchronisation et les listes parlent la même langue.

export const VERIFICATION_STATUS_LABELS = {
  DECLARED: "Déclarée",
  AGENT_VERIFIED: "Vérifiée par un agent",
  FIELD_VERIFIED: "Vérifiée sur le terrain",
  DISPUTED: "Contestée",
} as const;

export type VerificationStatus = keyof typeof VERIFICATION_STATUS_LABELS;

export const VERIFICATION_STATUS_VARIANTS: Record<
  VerificationStatus,
  "outline" | "info" | "success" | "warning"
> = {
  DECLARED: "outline",
  AGENT_VERIFIED: "info",
  FIELD_VERIFIED: "success",
  DISPUTED: "warning",
};

export const COMMAND_LABELS: Record<SyncCommandType, string> = {
  "farmer.create": "Nouveau producteur",
  "farm.create": "Nouvelle exploitation",
  "parcel.create": "Nouvelle parcelle",
  "parcel.geometry.set": "Contour de parcelle",
  "cropSeason.declare": "Culture de la campagne",
  "harvest.declare": "Récolte déclarée",
  "verification.record": "Visite de vérification",
  "alert.relay": "Alerte relayée",
  "fieldReport.create": "Signalement de terrain",
};

export const OUTBOX_STATUS_LABELS = {
  PENDING: "En attente",
  SENDING: "Envoi en cours",
  APPLIED: "Enregistrée",
  // Un renvoi reconnu par le serveur est une réussite pour l'agent (docs/modules/registre-parcours-ux.md §5).
  DUPLICATE: "Enregistrée",
  REJECTED: "Refusée",
  CONFLICT: "Conflit",
} as const;

export const EVENT_LABELS: Record<string, string> = {
  CREATED: "Exploitation enregistrée",
  PARCEL_ADDED: "Parcelle ajoutée",
  PARCEL_GEOMETRY_SET: "Contour relevé",
  CROP_DECLARED: "Culture déclarée",
  HARVEST_DECLARED: "Récolte déclarée",
  VERIFIED: "Visite de vérification",
  ALERT_RELAYED: "Alerte relayée au producteur",
};

export const TENURE_LABELS: Record<string, string> = {
  OWNED: "Propriétaire",
  RENTED: "Location",
  FAMILY: "Familial",
  SHARED: "Métayage ou partage",
  UNKNOWN: "Non précisé",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  CROPS: "Cultures",
  MIXED: "Cultures et élevage",
  LIVESTOCK_DOMINANT: "Élevage surtout",
};

export const SUB_SEASON_LABELS: Record<string, string> = {
  MAIN_RAINY: "Grande saison des pluies",
  SHORT_RAINY: "Petite saison des pluies",
  DRY: "Contre-saison",
  ANNUAL: "Toute l'année",
};

export const CROP_STAGE_LABELS: Record<string, string> = {
  PLANNED: "Prévue",
  SOWN: "Semée",
  GROWING: "En croissance",
  FLOWERING: "En floraison",
  HARVESTED: "Récoltée",
  FAILED: "Perdue",
};

export const CAPTURE_METHOD_LABELS: Record<string, string> = {
  GPS_WALK: "Marche GPS",
  MAP_DRAW: "Dessin sur carte",
  DECLARED_ONLY: "Superficie déclarée",
};

const areaFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatHa(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${areaFormatter.format(value)} ha`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

const coordinateFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
});

// Position lisible : « 9,70000° N, 1,67000° E » (le Bénin est entièrement au nord et à l'est).
export function formatPosition(point: { lat: number; lng: number } | null): string {
  if (!point) return "—";
  const lat = `${coordinateFormatter.format(Math.abs(point.lat))}° ${point.lat >= 0 ? "N" : "S"}`;
  const lng = `${coordinateFormatter.format(Math.abs(point.lng))}° ${point.lng >= 0 ? "E" : "O"}`;
  return `${lat}, ${lng}`;
}
