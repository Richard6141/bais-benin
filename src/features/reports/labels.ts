import type { FieldReportStatus, FieldReportType } from "@/modules/reports";

// Libellés des signalements, partagés par les écrans du producteur, de l'agent et du ministère.

export const REPORT_TYPE_LABELS: Record<FieldReportType, { label: string; hint: string }> = {
  PEST: { label: "Ravageur", hint: "Chenilles, criquets, insectes, rongeurs" },
  CROP_DISEASE: { label: "Maladie des cultures", hint: "Taches, feuilles jaunies, pourriture" },
  ANIMAL_DISEASE: { label: "Maladie animale", hint: "Bétail ou volaille malades, morts" },
  OTHER: { label: "Autre problème", hint: "Tout autre souci sur la parcelle" },
};

export const REPORT_STATUS_LABELS: Record<
  FieldReportStatus,
  { label: string; tone: "info" | "success" | "watch" }
> = {
  SUBMITTED: { label: "Reçu, en attente de visite", tone: "info" },
  CONFIRMED: { label: "Confirmé sur place", tone: "success" },
  DISMISSED: { label: "Écarté après visite", tone: "watch" },
};

export const LOCATION_SOURCE_LABELS: Record<string, string> = {
  GPS: "Position relevée par le téléphone",
  PARCEL: "Centre de la parcelle",
  FARM: "Position de l'exploitation",
  NONE: "Position inconnue",
};
