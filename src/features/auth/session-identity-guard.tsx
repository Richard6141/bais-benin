"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/auth-client";

// B2 : le service worker sert les pages authentifiées en NetworkFirst avec un repli sur un
// cache jusqu'à quelques jours (sw.ts) — utile en réseau lent ou hors ligne, mais si un agent A
// n'a jamais utilisé le bouton de déconnexion (session expirée naturellement, cookies effacés
// par l'appareil plutôt que par l'application) et qu'un agent B se connecte ensuite sur le même
// téléphone en réseau coupé, ce repli pourrait lui servir la page HTML encore en cache de A. Ce
// composant compare, à l'affichage, l'identifiant pour lequel la page a été rendue à celui de la
// session réellement active (lue via /api/auth, toujours en NetworkOnly dans sw.ts, donc jamais
// une réponse mise en cache) : en cas d'écart, la page est manifestement une copie périmée d'un
// autre compte — les caches propres au compte sont vidés et un rechargement forcé la remplace
// par la vraie page de la session active, avant qu'aucune donnée n'ait pu être lue à l'écran.
const ACCOUNT_SCOPED_CACHES = ["bais-registry-data", "bais-spaces-pages", "bais-spaces-rsc"];

export function SessionIdentityGuard({ userId }: { userId: string }) {
  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        const activeUserId = data?.user.id;
        if (activeUserId && activeUserId !== userId) {
          if (typeof caches !== "undefined") {
            await Promise.all(
              ACCOUNT_SCOPED_CACHES.map((name) => caches.delete(name).catch(() => false)),
            );
          }
          window.location.reload();
        }
      })
      .catch(() => {
        // Hors ligne ou session illisible : on garde la page affichée plutôt que de la
        // recharger en boucle sans réseau.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
