import type { VegetationCheckReason, VegetationCheckStatus } from "@/modules/satellite";

// Libellés de la confrontation déclaration / satellite (ADR-0016), partagés par le pilotage et
// l'espace agent. « À vérifier » demande une visite : jamais « fausse déclaration ».

export const VEGETATION_STATUS_LABELS: Record<VegetationCheckStatus, string> = {
  CONSISTENT: "Cohérente avec la déclaration",
  TO_VERIFY: "À vérifier sur le terrain",
  INSUFFICIENT_DATA: "Trop de nuages pour conclure",
  PENDING: "Saison en cours",
};

export const VEGETATION_STATUS_VARIANTS: Record<
  VegetationCheckStatus,
  "success" | "warning" | "offline" | "info"
> = {
  CONSISTENT: "success",
  TO_VERIFY: "warning",
  INSUFFICIENT_DATA: "offline",
  PENDING: "info",
};

export const VEGETATION_REASON_LABELS: Record<VegetationCheckReason, string> = {
  LOW_PEAK: "Végétation trop faible pour la culture déclarée",
  NO_CYCLE: "Aucun cycle de culture visible sur la saison",
  LOW_COVER: "Couvert trop faible pour une plantation",
};

export function reasonLabel(reason: string | null): string | null {
  return reason && reason in VEGETATION_REASON_LABELS
    ? VEGETATION_REASON_LABELS[reason as VegetationCheckReason]
    : null;
}

const ndvi = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatNdvi(value: number | null): string {
  return value === null ? "—" : ndvi.format(value);
}

/** Provenance affichée : mesure Copernicus, ou série synthétique de démonstration. */
export function vegetationSourceLabel(sourceId: string): string {
  return sourceId === "COPERNICUS_S2"
    ? "Copernicus Sentinel-2 L2A (API Statistical du CDSE) · Contains modified Copernicus Sentinel data"
    : "Série NDVI synthétique de démonstration (BAIS)";
}
