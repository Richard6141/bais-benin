"use client";

import { useEffect, useMemo, useState } from "react";
import type { CommuneStats, StatsProvenance } from "@/modules/analytics";

export interface MapFilters {
  cropCode?: string;
  campaignCode?: string;
  departementCode?: string;
  verificationStatus?: "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED" | "DISPUTED";
}

interface StatsPayload {
  items: CommuneStats[];
  provenance: StatsProvenance & { generatedAt: string };
}

export interface TerritoryStatsState {
  status: "loading" | "ready" | "error";
  items: CommuneStats[];
  byCode: Map<string, CommuneStats>;
  provenance: StatsPayload["provenance"] | null;
}

export function filtersToSearchParams(filters: MapFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

// Charge les agrégats par commune pour les filtres courants. Un changement de filtre
// annule la requête précédente : la carte ne peint jamais un résultat périmé.
export function useTerritoryStats(filters: MapFilters): TerritoryStatsState {
  // Le résultat garde la requête qui l'a produit : tant qu'elle diffère de la requête
  // courante, l'état affiché est « chargement », sans écriture synchrone dans l'effet.
  const [state, setState] = useState<
    Omit<TerritoryStatsState, "byCode"> & { query: string | null }
  >({
    status: "loading",
    items: [],
    provenance: null,
    query: null,
  });
  const query = filtersToSearchParams(filters).toString();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/territory/stats?level=communes${query ? `&${query}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as StatsPayload;
      })
      .then((payload) =>
        setState({ status: "ready", items: payload.items, provenance: payload.provenance, query }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", items: [], provenance: null, query });
      });
    return () => controller.abort();
  }, [query]);

  const byCode = useMemo(
    () => new Map(state.items.map((item) => [item.communeCode, item])),
    [state.items],
  );
  const status = state.query === query ? state.status : "loading";
  return { status, items: state.items, provenance: state.provenance, byCode };
}
