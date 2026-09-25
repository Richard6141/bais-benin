// Détection de WebGL2, requis par MapLibre. Certains téléphones Android d'entrée de gamme ou des
// navigateurs à accélération graphique désactivée ne l'ont pas : la carte ne doit pas planter la
// page, elle cède la place à un avis. Appelée côté navigateur uniquement (cartes sans rendu serveur).
export function hasWebGL2(): boolean {
  if (typeof document === "undefined") return true;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
