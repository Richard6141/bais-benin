"use client";

import { useEffect, useState } from "react";
import type { ImageryCatalog } from "@/modules/satellite";

export type ImageryCatalogState =
  { status: "loading" } | { status: "error" } | { status: "ready"; catalog: ImageryCatalog };

// Périodes d'imagerie Sentinel-2 (catalogue Copernicus), chargées une fois par visite : la route
// est mise en cache côté serveur, le catalogue change au plus tous les deux à cinq jours.
export function useImageryCatalog(): ImageryCatalogState {
  const [state, setState] = useState<ImageryCatalogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/satellite/periods", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setState({ status: "ready", catalog: (await response.json()) as ImageryCatalog });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);
  return state;
}
