"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Côté serveur on suppose la connexion présente : le bandeau n'apparaît qu'après
// hydratation, ce qui évite un éclair de bandeau au chargement.
function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useIsOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-offline px-4 py-2 text-sm font-medium text-paper"
    >
      <WifiOff className="size-4" aria-hidden />
      <span>Hors connexion : vos saisies sont conservées sur cet appareil.</span>
    </div>
  );
}
