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
};

export const OUTBOX_STATUS_LABELS = {
  PENDING: "En attente",
  SENDING: "Envoi en cours",
  APPLIED: "Enregistrée",
  DUPLICATE: "Déjà enregistrée",
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
};

export const TENURE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  RENTED: "Location",
  FAMILY: "Familial",
  SHARECROPPING: "Métayage",
  OTHER: "Autre",
};

export const CAPTURE_METHOD_LABELS: Record<string, string> = {
  GPS_WALK: "Marche GPS",
  MAP_DRAW: "Dessin sur carte",
  DECLARED_ONLY: "Déclarée",
  IMPORTED: "Importée",
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
