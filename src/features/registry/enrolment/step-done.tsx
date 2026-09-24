"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SyncStatusChip } from "@/components/forms/sync-status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SyncState } from "@/lib/offline/use-sync";
import type { EnrolmentResult } from "./enrolment-types";

interface StepDoneProps {
  result: EnrolmentResult;
  farmerLabel: string;
  sync: SyncState;
  onAnother: () => void;
}

// A7 : confirmation avec le code provisoire et l'état de synchronisation. Le code définitif
// arrivera du serveur à la synchronisation ; le provisoire reste un alias.
export function StepDone({ result, farmerLabel, sync, onAnother }: StepDoneProps) {
  return (
    <section className="flex flex-col gap-5" aria-labelledby="done-title">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-success">
            <CheckCircle2 aria-hidden className="size-6" />
            <span className="text-sm font-medium">Exploitation enregistrée sur cet appareil</span>
          </div>
          <CardTitle id="done-title">{farmerLabel}</CardTitle>
          <CardDescription>
            Code provisoire <span className="tabular font-mono">{result.farmCode}</span>, remplacé
            par le code définitif à la synchronisation.
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
              ? "Les données partent maintenant."
              : "Sans réseau, les données attendent sur l'appareil et partiront seules au retour du réseau."}
          </p>
        </CardContent>
      </Card>
      <Button type="button" onClick={onAnother} className="h-14 w-full text-base">
        Enregistrer une autre exploitation
      </Button>
      <Button asChild variant="outline" className="h-12 w-full">
        <Link href="/agent/exploitations">Voir mes exploitations</Link>
      </Button>
    </section>
  );
}
