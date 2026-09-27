// Message d'une couche « Feux actifs » vide (ADR-0022, chantier K) : en saison des pluies elle
// peut rester sans point plusieurs jours, mieux vaut le dire que de laisser une carte muette.
// Partagé entre la légende de la carte agricole et le centre de veille.

export function fireEmptyMessage(window: "24h" | "7j", sevenDayCount: number | null): string {
  if (window === "7j") return "Aucun feu détecté ces 7 derniers jours.";
  const suffix =
    sevenDayCount === null ? "" : ` ${sevenDayCount.toLocaleString("fr-FR")} sur 7 jours.`;
  return `Aucun feu détecté ces dernières 24 heures.${suffix}`;
}
