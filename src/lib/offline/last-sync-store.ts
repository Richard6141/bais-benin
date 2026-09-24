// Horodatage de la dernière synchronisation réussie, par utilisateur, conservé dans le
// navigateur et exposé comme source externe pour React (pas de setState dans un effet).

const LAST_SYNC_KEY = "bais.last-sync-at";
const listeners = new Set<() => void>();

function storageKey(userId: string) {
  return `${LAST_SYNC_KEY}.${userId}`;
}

export function readLastSyncedAt(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function writeLastSyncedAt(userId: string, stamp: string): void {
  try {
    window.localStorage.setItem(storageKey(userId), stamp);
  } catch {
    // Stockage indisponible : l'horodatage ne survivra pas à la session.
  }
  for (const listener of listeners) listener();
}

export function subscribeLastSynced(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
