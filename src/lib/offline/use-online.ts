"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Côté serveur on suppose la connexion présente : les états « hors ligne » n'apparaissent
// qu'après hydratation, ce qui évite un éclair de bandeau au chargement.
function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useIsOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
