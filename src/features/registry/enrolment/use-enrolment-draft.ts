"use client";

import { useEffect, useEffectEvent } from "react";
import type { AgentDatabase } from "@/lib/offline/db";
import { openEnrolmentDraft, type EnrolmentDraft } from "./enrolment-draft";

export const ENROLMENT_PATH = "/agent/enregistrer";

/**
 * Identifiant du brouillon dans l'adresse, sans aller-retour serveur (l'écran doit fonctionner
 * hors ligne). Les autres paramètres restent : ?pas= garde la bulle des premiers pas ouverte.
 */
function writeDraftAddress(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("brouillon", id);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

// Brouillon de l'écran d'enregistrement, repris par ?brouillon=<id>. Un brouillon neuf reçoit son
// identifiant dès l'ouverture de l'écran, écrit aussitôt dans l'adresse : React exécute cet effet
// avant de traiter le premier geste. Écrit après la création asynchrone dans IndexedDB, il
// annulait une navigation lancée entre-temps : le routeur de Next relit history.replaceState et
// revient à l'écran en cours. Le brouillon est ensuite ouvert, ou créé, sous cet identifiant.
export function useEnrolmentDraft(
  db: AgentDatabase,
  requestedId: string | null,
  onOpen: (draft: EnrolmentDraft) => void,
) {
  const opened = useEffectEvent(onOpen);

  useEffect(() => {
    if (!requestedId) writeDraftAddress(crypto.randomUUID());
  }, [requestedId]);

  useEffect(() => {
    if (!requestedId) return;
    let cancelled = false;
    void openEnrolmentDraft(db, requestedId).then((draft) => {
      if (cancelled) return;
      if (draft) opened(draft);
      // Identifiant d'un autre type de brouillon : un brouillon neuf, seulement si l'écran est
      // toujours celui de l'enregistrement.
      else if (window.location.pathname === ENROLMENT_PATH) writeDraftAddress(crypto.randomUUID());
    });
    return () => {
      cancelled = true;
    };
  }, [db, requestedId]);
}
