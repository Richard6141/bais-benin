"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, WifiOff } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAgentDatabase } from "@/lib/offline/db";
import { farmsCacheInfo, loadReferentiel } from "@/lib/offline/referentiel-cache";

// Rappel de préparation du hors-ligne tant que le référentiel n'est pas sur l'appareil.
// Disparaît une fois le premier téléchargement fait (parcours F).
export function OfflineReadiness({ userId }: { userId: string }) {
  const db = getAgentDatabase(userId);
  const state = useLiveQuery(
    async () => {
      const [bundle, farms] = await Promise.all([loadReferentiel(db), farmsCacheInfo(db)]);
      return { ready: bundle !== null, farms: farms.count };
    },
    [db],
    null,
  );
  if (state === null || state.ready) return null;
  return (
    <Alert variant="info">
      <WifiOff aria-hidden />
      <AlertTitle>Préparez le travail sans réseau</AlertTitle>
      <AlertDescription>
        <p>
          Téléchargez une fois les communes de votre périmètre, leurs cultures et leurs
          exploitations. Ensuite, tout fonctionne sans connexion.
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/agent/premier-lancement">
            <Download aria-hidden />
            Télécharger maintenant
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
