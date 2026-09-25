"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getAgentDatabase } from "./db";
import { getDeviceId } from "./device-id";
import { readLastSyncedAt, subscribeLastSynced, writeLastSyncedAt } from "./last-sync-store";
import { outboxCounts } from "./outbox";
import type { SyncRunOutcome } from "./sync-client";
import { syncOnce } from "./sync-runner";
import { useIsOnline } from "./use-online";

const BACKGROUND_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  lastOutcome: SyncRunOutcome | null;
  sync: () => Promise<void>;
}

// Orchestration de la synchronisation : au retour du réseau, toutes les cinq minutes s'il
// reste des commandes, et à la demande. Une seule exécution à la fois.
export function useSync(userId: string): SyncState {
  const db = useMemo(() => getAgentDatabase(userId), [userId]);
  const online = useIsOnline();
  const [syncing, setSyncing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<SyncRunOutcome | null>(null);
  const runningRef = useRef(false);

  const counts = useLiveQuery(() => outboxCounts(db), [db], { pending: 0, failed: 0 });
  const lastSyncedAt = useSyncExternalStore(
    subscribeLastSynced,
    () => readLastSyncedAt(userId),
    () => null,
  );

  const sync = useCallback(async () => {
    if (runningRef.current || !navigator.onLine) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      const outcome = await syncOnce(userId, db, { deviceId: getDeviceId() });
      if (outcome) {
        setLastOutcome(outcome);
        if (!outcome.error) writeLastSyncedAt(userId, new Date().toISOString());
      }
    } finally {
      runningRef.current = false;
      setSyncing(false);
    }
  }, [db, userId]);

  useEffect(() => {
    if (online && counts.pending > 0) void sync();
  }, [online, counts.pending, sync]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (counts.pending > 0) void sync();
    }, BACKGROUND_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [counts.pending, sync]);

  return {
    online,
    syncing,
    pending: counts.pending,
    failed: counts.failed,
    lastSyncedAt,
    lastOutcome,
    sync,
  };
}
