"use client";

import { useSync } from "@/lib/offline/use-sync";

// L'espace agriculteur n'a pas de barre de synchronisation comme celui de l'agent : ce bandeau
// discret envoie les signalements et les demandes restés dans la file du téléphone dès que le
// réseau revient (useSync), et dit combien attendent encore.
export function PendingReports({ userId }: { userId: string }) {
  const sync = useSync(userId);
  if (sync.pending === 0 && sync.failed === 0) return null;
  const plural = (count: number) => (count > 1 ? "s" : "");
  return (
    <p role="status" className="rounded-md border px-4 py-3 text-sm">
      {sync.pending > 0
        ? `${sync.pending} envoi${plural(sync.pending)} en attente${sync.online ? ", envoi en cours" : " : départ au retour du réseau."}`
        : `${sync.failed} envoi${plural(sync.failed)} refusé${plural(sync.failed)} par le serveur : refaites la saisie.`}
    </p>
  );
}
