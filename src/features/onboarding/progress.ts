"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { TourRole } from "./steps";

// Progression des « Premiers pas », gardée sur l'appareil (localStorage), par compte et par rôle :
// rien n'est envoyé au serveur. Un stockage bloqué (navigation privée) rend un parcours neuf à
// chaque page, sans erreur.

export interface TourProgress {
  done: string[];
  /** Carte des premiers pas repliée par l'utilisateur. */
  hidden: boolean;
}

const EMPTY: TourProgress = { done: [], hidden: false };
const EVENT = "bais:premiers-pas";

function keyOf(role: TourRole, userId: string): string {
  return `bais:premiers-pas:v1:${role}:${userId}`;
}

// Instantanés mis en cache par clé : useSyncExternalStore exige la même référence tant que la
// valeur stockée ne change pas.
const cache = new Map<string, { raw: string | null; value: TourProgress }>();

function read(key: string): TourProgress {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value = EMPTY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<TourProgress>;
      value = {
        done: Array.isArray(parsed.done) ? parsed.done.filter((id) => typeof id === "string") : [],
        hidden: parsed.hidden === true,
      };
    } catch {
      value = EMPTY;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: TourProgress): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : la progression ne survit pas à la page, sans autre conséquence.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Progression d'un parcours, et les gestes qui la font avancer. Null avant l'hydratation. */
export function useTourProgress(role: TourRole, userId: string) {
  const key = keyOf(role, userId);
  const progress = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const markDone = useCallback(
    (stepId: string) => {
      const current = read(key);
      if (current.done.includes(stepId)) return;
      write(key, { ...current, done: [...current.done, stepId] });
    },
    [key],
  );
  const setHidden = useCallback((hidden: boolean) => write(key, { ...read(key), hidden }), [key]);
  const reset = useCallback(() => write(key, EMPTY), [key]);

  return { progress, markDone, setHidden, reset };
}
