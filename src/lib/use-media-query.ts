"use client";

import { useSyncExternalStore } from "react";

/**
 * Vrai quand la requête média correspond (« (min-width: 1024px) »). Null au rendu serveur et avant
 * l'hydratation : l'appelant n'affiche alors aucune des deux variantes, plutôt que la mauvaise.
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}
