// Distance d'un feu à une parcelle (accueil agriculteur, chantier K) : en mètres en dessous d'un
// kilomètre, sinon en kilomètres à une décimale.
export function formatFireDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}
