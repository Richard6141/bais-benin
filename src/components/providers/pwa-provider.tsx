"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

// Enregistre le service worker. Désactivé en développement pour ne pas servir
// des pages périmées depuis le cache pendant que l'on itère.
//
// reloadOnOnline est coupé : par défaut, Serwist recharge la page à chaque retour du réseau. Sur
// un réseau rural qui va et vient, l'agent perdrait la saisie en cours de l'écran affiché, et un
// rechargement en pleine navigation annule la page demandée. Le retour du réseau est déjà géré
// par l'application : la synchronisation repart d'elle-même (useSync).
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
