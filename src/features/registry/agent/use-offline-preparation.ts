"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getAgentDatabase } from "@/lib/offline/db";
import { downloadOfflineData, loadReferentiel } from "@/lib/offline/referentiel-cache";

/**
 * État de la préparation du travail sans réseau sur cet appareil :
 * - « checking » : lecture de la base locale en cours ;
 * - « ready » : référentiel présent, tout fonctionne hors ligne ;
 * - « running » : téléchargement automatique en cours ;
 * - « failed » : le téléchargement a échoué, le premier lancement reste le recours ;
 * - « offline » : référentiel absent et pas de réseau pour le télécharger.
 */
export type OfflinePreparation = "checking" | "ready" | "running" | "failed" | "offline";

// Un seul téléchargement à la fois par compte, quel que soit le nombre d'écrans qui le demandent.
const jobs = new Map<string, Promise<void>>();
// Périmètres déjà rechargés dans cette session : si le serveur répond encore avec une autre
// empreinte (réaffectation entre deux affichages), on ne relance pas en boucle.
const refreshed = new Set<string>();

export function prepareOffline(userId: string): Promise<void> {
  let job = jobs.get(userId);
  if (!job) {
    job = downloadOfflineData(getAgentDatabase(userId)).finally(() => jobs.delete(userId));
    jobs.set(userId, job);
  }
  return job;
}

type LocalState = "missing" | "current" | "stale";

// Préparation du hors-ligne sans geste de l'agent : dès qu'il est connecté et que le référentiel
// de son périmètre manque sur l'appareil, il se télécharge en arrière-plan (même contenu que le
// premier lancement). L'écran de premier lancement reste le recours hors réseau ou en cas d'échec.
// Avec `scopeKey` (le périmètre actuel, donné par le serveur), un référentiel d'un ancien
// périmètre est aussi rechargé, sans bloquer l'agent qui garde l'ancien en attendant.
export function useOfflinePreparation(userId: string, scopeKey?: string): OfflinePreparation {
  const db = getAgentDatabase(userId);
  const local = useLiveQuery(async (): Promise<LocalState> => {
    const bundle = await loadReferentiel(db);
    if (!bundle) return "missing";
    return scopeKey === undefined || bundle.scopeKey === scopeKey ? "current" : "stale";
  }, [db, scopeKey]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const on = () => {
      setFailed(false);
      setOnline(true);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!online || failed) return;
    if (local === "stale") {
      const key = `${userId}:${scopeKey}`;
      if (refreshed.has(key)) return;
      refreshed.add(key);
    } else if (local !== "missing") {
      return;
    }
    let cancelled = false;
    prepareOffline(userId).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [local, online, failed, userId, scopeKey]);

  if (local === undefined) return "checking";
  if (local !== "missing") return "ready";
  if (!online) return "offline";
  return failed ? "failed" : "running";
}
