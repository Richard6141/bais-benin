"use client";

import { useEffect, useState } from "react";
import { fireDataUrl, type FireCollection, type FireWindowParam } from "./fire-layer";

// Feux actifs pour une fenêtre (24 heures ou 7 jours), relus à intervalle régulier quand
// `refreshMs` est donné (centre de veille). Null sans fenêtre ou tant que la fenêtre demandée
// n'est pas chargée : le résultat garde la fenêtre qui l'a produit, sans écriture synchrone dans
// l'effet.

export function useFires(
  window: FireWindowParam | null,
  refreshMs?: number,
): FireCollection | null {
  const [loaded, setLoaded] = useState<{ window: FireWindowParam; data: FireCollection } | null>(
    null,
  );
  useEffect(() => {
    if (!window) return;
    const controller = new AbortController();
    const load = () =>
      fetch(fireDataUrl(window), { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<FireCollection>) : null))
        .then((data) => {
          if (data) setLoaded({ window, data });
        })
        .catch(() => undefined);
    void load();
    const timer = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [window, refreshMs]);
  return window && loaded?.window === window ? loaded.data : null;
}
