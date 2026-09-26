"use client";

import { CloudOff, CloudUpload, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncStatusChipProps {
  pending: number;
  failed: number;
  /** Date ISO de la dernière synchronisation réussie, null si jamais. */
  lastSyncedAt: string | null;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  /** Horloge injectable pour les tests. */
  now?: () => number;
  className?: string;
}

const relativeFormatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/** « il y a 5 min », « il y a 2 h », « hier »… à partir d'une date ISO. */
export function formatRelative(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormatter.format(Math.round(seconds / 3600), "hour");
  return relativeFormatter.format(Math.round(seconds / 86_400), "day");
}

export type SyncState = "ERROR" | "OFFLINE" | "SYNCING" | "PENDING" | "UP_TO_DATE";

// Priorité des états : une erreur passe avant tout, puis l'absence de réseau (rien ne partira),
// puis l'envoi en cours, puis l'attente, et enfin « à jour ».
export function deriveSyncState(input: {
  pending: number;
  failed: number;
  online: boolean;
  syncing: boolean;
}): SyncState {
  if (input.failed > 0) return "ERROR";
  if (!input.online) return "OFFLINE";
  if (input.syncing) return "SYNCING";
  if (input.pending > 0) return "PENDING";
  return "UP_TO_DATE";
}

// Puce d'état de synchronisation de l'en-tête agent : toujours visible, un tap synchronise.
// Le libellé porte le sens, la couleur l'appuie (docs/modules/registre-parcours-ux.md §0).
export function SyncStatusChip({
  pending,
  failed,
  lastSyncedAt,
  online,
  syncing,
  onSync,
  now = Date.now,
  className,
}: SyncStatusChipProps) {
  const state = deriveSyncState({ pending, failed, online, syncing });
  const waiting = pending + failed;
  const waitingLabel = `${waiting} à envoyer`;

  const content: Record<
    SyncState,
    { variant: VariantProps<typeof badgeVariants>["variant"]; Icon: typeof RefreshCw; text: string }
  > = {
    ERROR: { variant: "critical", Icon: TriangleAlert, text: `${failed} en erreur` },
    OFFLINE: {
      variant: "offline",
      Icon: CloudOff,
      text: waiting > 0 ? `Hors ligne (${waitingLabel})` : "Hors ligne",
    },
    SYNCING: { variant: "info", Icon: Loader2, text: "Synchronisation en cours" },
    PENDING: { variant: "watch", Icon: CloudUpload, text: waitingLabel },
    UP_TO_DATE: {
      variant: "success",
      Icon: RefreshCw,
      text: lastSyncedAt ? `À jour ${formatRelative(lastSyncedAt, now())}` : "À jour",
    },
  };
  const current = content[state];

  const canSync = online && !syncing;

  return (
    <div
      role="status"
      aria-live="polite"
      data-sync-state={state}
      className={cn("inline-flex items-center gap-1", className)}
    >
      <Badge variant={current.variant} className="h-8 gap-1.5 px-2.5 text-sm">
        <current.Icon aria-hidden className={cn("size-4", state === "SYNCING" && "animate-spin")} />
        <span className="tabular">{current.text}</span>
      </Badge>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Synchroniser maintenant"
        disabled={!canSync}
        onClick={onSync}
      >
        <RefreshCw aria-hidden />
      </Button>
    </div>
  );
}
