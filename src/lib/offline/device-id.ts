// Identifiant stable de l'appareil, généré une fois et conservé dans le navigateur.
// Il accompagne chaque lot de synchronisation (docs/06 §2) et permet de révoquer un appareil.

const STORAGE_KEY = "bais.device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Stockage indisponible (navigation privée stricte) : identifiant de session seulement.
    return `session-${crypto.randomUUID()}`;
  }
}
