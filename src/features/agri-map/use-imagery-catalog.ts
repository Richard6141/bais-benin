"use client";

import { useEffect, useState } from "react";
import type { ImageryCatalog } from "@/modules/satellite";

export type ImageryCatalogState =
  { status: "loading" } | { status: "error" } | { status: "ready"; catalog: ImageryCatalog };

/** Nouvel essai tant que le serveur n'a qu'un catalogue provisoire (premier calcul en cours). */
const PARTIAL_RETRY_MS = 15_000;
const PARTIAL_RETRIES = 4;

// Périodes d'imagerie Sentinel-2 (catalogue Copernicus), chargées une fois par visite : la route
// répond tout de suite, le catalogue change au plus tous les deux à cinq jours. Une réponse
// provisoire (périodes sans comptes de scènes) est redemandée quelques secondes plus tard.
export function useImageryCatalog(): ImageryCatalogState {
  const [state, setState] = useState<ImageryCatalogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetch("/api/v1/satellite/periods", { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          const catalog = (await response.json()) as ImageryCatalog;
          setState({ status: "ready", catalog });
          if (catalog.partial && attempt < PARTIAL_RETRIES) {
            timer = setTimeout(() => load(attempt + 1), PARTIAL_RETRY_MS);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && attempt === 0) setState({ status: "error" });
        });
    };
    load(0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return state;
}
