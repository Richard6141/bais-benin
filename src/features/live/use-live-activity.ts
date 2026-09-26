"use client";

import { useEffect, useState } from "react";
import type { LiveActivityItem } from "@/modules/live";

// Abonnement au fil d'activité en direct (/api/v1/live/activity, flux d'événements serveur). Le
// navigateur se reconnecte seul après une coupure ou la fermeture périodique du flux, et reprend au
// dernier fait reçu. Les faits sont gardés du plus récent au plus ancien, sans doublon.

export type LiveStatus = "connecting" | "live" | "reconnecting";

const KEEP = 40;

export interface LiveActivityState {
  status: LiveStatus;
  items: LiveActivityItem[];
  /** Identifiants arrivés depuis l'ouverture de la page (mis en évidence un instant). */
  fresh: ReadonlySet<string>;
}

export function mergeActivity(
  current: readonly LiveActivityItem[],
  incoming: readonly LiveActivityItem[],
  keep = KEEP,
): LiveActivityItem[] {
  const seen = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => !seen.has(item.id));
  return [...added, ...current]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, keep);
}

export function useLiveActivity(onItems?: (items: LiveActivityItem[]) => void): LiveActivityState {
  const [state, setState] = useState<LiveActivityState>({
    status: "connecting",
    items: [],
    fresh: new Set(),
  });

  useEffect(() => {
    const source = new EventSource("/api/v1/live/activity");
    const receive = (event: Event, isNew: boolean) => {
      const incoming = JSON.parse((event as MessageEvent<string>).data) as LiveActivityItem[];
      setState((previous) => ({
        status: "live",
        items: mergeActivity(previous.items, incoming),
        fresh: isNew ? new Set(incoming.map((item) => item.id)) : previous.fresh,
      }));
      if (isNew) onItems?.(incoming);
    };
    source.addEventListener("ready", () => {
      setState((previous) => ({ ...previous, status: "live" }));
    });
    // Rattrapage de l'heure écoulée : il remplit la liste sans rien signaler comme neuf.
    source.addEventListener("backlog", (event) => receive(event, false));
    source.addEventListener("activity", (event) => receive(event, true));
    source.onerror = () => {
      setState((previous) => ({ ...previous, status: "reconnecting" }));
    };
    return () => source.close();
    // Un seul abonnement par montage : le rappel est lu à l'arrivée de chaque fait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
