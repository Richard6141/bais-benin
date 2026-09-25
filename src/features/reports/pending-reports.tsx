"use client";

import { useSync } from "@/lib/offline/use-sync";

// L'espace agriculteur n'a pas de barre de synchronisation comme celui de l'agent : ce bandeau
// discret envoie les signalements restés dans la file du téléphone dès que le réseau revient
// (useSync), et dit combien attendent encore.
export function PendingReports({ userId }: { userId: string }) {
  const sync = useSync(userId);
  if (sync.pending === 0 && sync.failed === 0) return null;
  return (
    <p role="status" className="rounded-md border px-4 py-3 text-sm">
      {sync.pending > 0
        ? `${sync.pending} signalement${sync.pending > 1 ? "s" : ""} en attente d'envoi${sync.online ? "…" : " : envoi au retour du réseau."}`
        : `${sync.failed} signalement${sync.failed > 1 ? "s" : ""} refusé${sync.failed > 1 ? "s" : ""} par le serveur : refaites le signalement.`}
    </p>
  );
}
