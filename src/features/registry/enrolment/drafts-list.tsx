"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentDatabase } from "@/lib/offline/db";
import { abandonEnrolmentDraft, listEnrolmentDrafts } from "./enrolment-draft";
import { ENROLMENT_STEPS } from "./enrolment-types";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

// Page « En cours » : brouillons d'enregistrement, les plus récents en premier, reprise en un tap.
// Un brouillon de plus de 30 jours est signalé, jamais supprimé automatiquement.
export function DraftsList({ userId }: { userId: string }) {
  const db = useMemo(() => getAgentDatabase(userId), [userId]);
  const drafts = useLiveQuery(() => listEnrolmentDrafts(db), [db]);
  // Instant de rendu figé par requête, pour un calcul d'ancienneté stable entre deux rendus.
  const [now] = useState(() => Date.now());

  if (drafts === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="Aucun enregistrement en cours"
        description="Les enregistrements commencés et non terminés apparaîtront ici, prêts à reprendre."
        action={
          <Button asChild className="h-12">
            <Link href="/agent/enregistrer">Enregistrer une exploitation</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Enregistrements en cours">
      {drafts.map((draft) => {
        const stale = now - new Date(draft.updatedAt).getTime() > 30 * 86_400_000;
        return (
          <li
            key={draft.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{draft.farmerLabel}</span>
              <span className="text-sm text-muted-foreground">
                {draft.communeName ? `${draft.communeName} · ` : ""}
                Étape {draft.resumeStep + 1} sur 6 : {ENROLMENT_STEPS[draft.resumeStep]}
              </span>
              <span className="tabular text-xs text-muted-foreground">
                Modifié le {dateFormatter.format(new Date(draft.updatedAt))}
                {stale ? (
                  <Badge variant="watch" className="ml-2">
                    Plus de 30 jours
                  </Badge>
                ) : null}
              </span>
            </div>
            <div className="flex gap-2">
              <Button asChild className="h-11 flex-1 sm:flex-none">
                <Link href={`/agent/enregistrer?brouillon=${draft.id}`}>Reprendre</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => void abandonEnrolmentDraft(db, draft.id)}
              >
                Abandonner
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
