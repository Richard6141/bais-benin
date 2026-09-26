"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { SyncStatusChip } from "@/components/forms/sync-status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentDatabase } from "@/lib/offline/db";
import type { SyncState } from "@/lib/offline/use-sync";
import type { EnrolmentResult } from "./enrolment-types";

interface StepDoneProps {
  userId: string;
  result: EnrolmentResult;
  farmerLabel: string;
  sync: SyncState;
  onAnother: () => void;
}

// A7 : confirmation avec le code provisoire et l'état de synchronisation. Dès que l'exploitation
// est reçue par le serveur, sa fiche s'ouvre d'elle-même : c'est là que l'agent continue (contour
// des parcelles, cultures). Sans réseau, l'écran reste ici et la fiche s'ouvrira au retour du
// réseau si l'agent n'est pas passé à autre chose.
export function StepDone({ userId, result, farmerLabel, sync, onAnother }: StepDoneProps) {
  const router = useRouter();
  const db = useMemo(() => getAgentDatabase(userId), [userId]);
  const local = useLiveQuery(() => db.farms.get(result.farmId), [db, result.farmId]);
  const synced = local?.syncState === "SYNCED";
  const farmHref = `/agent/exploitations/${result.farmId}?nouvelle=1` as Route;

  useEffect(() => {
    if (synced) router.replace(farmHref);
  }, [synced, farmHref, router]);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="done-title">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-success">
            <CheckCircle2 aria-hidden className="size-6" />
            <span className="text-sm font-medium">
              {synced ? "Exploitation enregistrée" : "Exploitation enregistrée sur cet appareil"}
            </span>
          </div>
          <CardTitle id="done-title">{farmerLabel}</CardTitle>
          <CardDescription>
            {synced ? (
              <>
                Code <span className="tabular font-mono">{local?.code ?? result.farmCode}</span>.
                Ouverture de la fiche.
              </>
            ) : (
              <>
                Code provisoire <span className="tabular font-mono">{result.farmCode}</span>,
                remplacé par le code définitif à la synchronisation.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SyncStatusChip
            pending={sync.pending}
            failed={sync.failed}
            lastSyncedAt={sync.lastSyncedAt}
            online={sync.online}
            syncing={sync.syncing}
            onSync={() => void sync.sync()}
          />
          <p className="text-sm text-muted-foreground">
            {sync.online
              ? "Les données partent maintenant. La fiche de l'exploitation s'ouvre dès leur arrivée."
              : "Sans réseau, les données attendent sur l'appareil. La fiche s'ouvrira au retour du réseau."}
          </p>
        </CardContent>
      </Card>
      {synced ? (
        <Button asChild className="h-14 w-full text-base">
          <Link href={farmHref}>Ouvrir la fiche de l&apos;exploitation</Link>
        </Button>
      ) : null}
      <Button
        type="button"
        variant={synced ? "outline" : "default"}
        onClick={onAnother}
        className={synced ? "h-12 w-full" : "h-14 w-full text-base"}
      >
        Enregistrer une autre exploitation
      </Button>
      <Button asChild variant="outline" className="h-12 w-full">
        <Link href="/agent/exploitations">Voir mes exploitations</Link>
      </Button>
    </section>
  );
}
