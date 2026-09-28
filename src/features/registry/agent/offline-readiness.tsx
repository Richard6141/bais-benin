"use client";

import { Download, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOfflinePreparation } from "./use-offline-preparation";

// Rappel de préparation du hors-ligne tant que le référentiel n'est pas sur l'appareil.
// Connecté, l'agent n'a rien à faire : le téléchargement se lance seul et l'encart le dit. Le
// bouton ne sert qu'hors réseau ou après un échec. Disparaît une fois le référentiel présent.
export function OfflineReadiness({ userId }: { userId: string }) {
  const preparation = useOfflinePreparation(userId);
  if (preparation === "checking" || preparation === "ready") return null;
  if (preparation === "running") {
    return (
      <Alert variant="info" aria-live="polite">
        <RefreshCw aria-hidden className="animate-spin motion-reduce:animate-none" />
        <AlertTitle>Préparation du travail sans réseau</AlertTitle>
        <AlertDescription>
          <p>
            Les communes, cultures et exploitations de votre périmètre se téléchargent sur ce
            téléphone. Vous pouvez continuer à travailler.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="info">
      <WifiOff aria-hidden />
      <AlertTitle>Préparez le travail sans réseau</AlertTitle>
      <AlertDescription>
        <p>
          Téléchargez une fois les communes de votre périmètre, leurs cultures et leurs
          exploitations. Ensuite, tout fonctionne sans connexion.
        </p>
        <Button asChild className="mt-2">
          <Link href="/agent/premier-lancement">
            <Download aria-hidden />
            Télécharger maintenant
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
