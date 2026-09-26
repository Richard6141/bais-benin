"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, CloudDownload, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useIsOnline } from "@/lib/offline/use-online";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentDatabase } from "@/lib/offline/db";
import {
  downloadOfflineData,
  farmsCacheInfo,
  loadReferentiel,
  type DownloadProgress,
} from "@/lib/offline/referentiel-cache";
import { formatDateTime } from "./labels";

interface FirstLaunchProps {
  userId: string;
  communes: Array<{ code: string; name: string; departementName: string }>;
}

const EXPLANATIONS = [
  {
    title: "Travail sans réseau",
    text: "L'enregistrement, les parcelles, les cultures et les visites se font sur l'appareil.",
  },
  {
    title: "Envoi automatique",
    text: "Au retour du réseau, les saisies sont envoyées dans l'ordre de saisie.",
  },
  {
    title: "État de la synchronisation",
    text: "L'indicateur en haut de l'écran affiche les saisies en attente, envoyées et refusées.",
  },
];

// Premier lancement (parcours F) : téléchargement du référentiel et des exploitations du périmètre.
export function FirstLaunch({ userId, communes }: FirstLaunchProps) {
  const db = getAgentDatabase(userId);
  const online = useIsOnline();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const cached = useLiveQuery(
    async () => {
      const [bundle, farms] = await Promise.all([loadReferentiel(db), farmsCacheInfo(db)]);
      return { version: bundle?.version ?? null, communes: bundle?.communes.length ?? 0, farms };
    },
    [db],
    null,
  );

  async function start() {
    setRunning(true);
    setError(null);
    try {
      await downloadOfflineData(db, { onProgress: setProgress });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Téléchargement interrompu");
    } finally {
      setRunning(false);
    }
  }

  const ready = cached?.version !== null && cached?.version !== undefined;
  const done = progress?.block === "done";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Vos communes</CardTitle>
          <CardDescription>
            {communes.length === 0
              ? "Aucune commune n'est affectée à votre compte : demandez une affectation à votre superviseur."
              : "Ces communes seront disponibles sans réseau : limites, cultures, campagnes et exploitations connues."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-2">
            {communes.map((commune) => (
              <li key={commune.code} className="rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{commune.name}</span>
                <span className="text-muted-foreground"> ({commune.departementName})</span>
              </li>
            ))}
          </ul>

          {cached && ready ? (
            <p className="text-sm text-muted-foreground" data-testid="offline-cache-state">
              Déjà sur l&apos;appareil : {cached.communes} commune{cached.communes > 1 ? "s" : ""},{" "}
              {cached.farms.count} exploitation{cached.farms.count > 1 ? "s" : ""}
              {cached.farms.cachedAt
                ? `, mises à jour le ${formatDateTime(cached.farms.cachedAt)}`
                : ""}
              .
            </p>
          ) : null}

          {!online ? (
            <Alert variant="watch">
              <AlertTitle>Connectez-vous une fois pour préparer le hors-ligne</AlertTitle>
              <AlertDescription>
                Le téléchargement démarrera dès que le réseau sera de retour.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="critical">
              <AlertTitle>Téléchargement interrompu</AlertTitle>
              <AlertDescription>{error} Réessayez, il reprendra du début.</AlertDescription>
            </Alert>
          ) : null}

          {progress && !done ? (
            <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {progress.block === "referentiel"
                ? "Référentiel des communes et cultures…"
                : `Exploitations : ${progress.loaded} reçues…`}
            </p>
          ) : null}

          {done ? (
            <p
              className="flex items-center gap-2 text-sm text-success"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Terminé : {progress?.loaded} exploitation{(progress?.loaded ?? 0) > 1 ? "s" : ""}{" "}
              prêtes hors ligne.
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => void start()}
              disabled={!online || running || communes.length === 0}
              className="h-12"
            >
              <CloudDownload aria-hidden />
              {ready ? "Mettre à jour" : "Télécharger"}
            </Button>
            <Button asChild variant={ready || done ? "default" : "outline"} className="h-12">
              <Link href="/agent">{ready || done ? "Commencer" : "Plus tard"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <ol className="grid gap-4 sm:grid-cols-3">
        {EXPLANATIONS.map((item, index) => (
          <li key={item.title}>
            <Card className="h-full">
              <CardHeader>
                <span className="tabular mb-1 flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold">
                  {index + 1}
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.text}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
