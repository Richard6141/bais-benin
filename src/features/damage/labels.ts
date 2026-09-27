// Libellés des déclarations de sinistre (ADR-0038 §2), partagés par les écrans serveur et client.

export const DAMAGE_STATUS_LABELS = {
  PROPOSED: "À confirmer",
  CONFIRMED: "Confirmée",
  REJECTED: "Écartée",
} as const;
