import type { AgentDatabase } from "./db";
import { runSync, type SyncRunOutcome } from "./sync-client";

// Une seule synchronisation à la fois par compte : plusieurs composants (puce d'en-tête, écran
// de fin de saisie) et plusieurs onglets peuvent la demander en même temps. Deux lots identiques
// envoyés en parallèle ne créent pas de doublon côté serveur, mais gaspillent le réseau et
// brouillent l'état affiché.

const inFlight = new Map<string, Promise<SyncRunOutcome | null>>();

interface RunnerOptions {
  deviceId: string;
  fetchImpl?: typeof fetch;
}

// Enchaîne les lots tant qu'il reste des commandes appliquées ; renvoie le dernier résultat,
// ou null si un autre onglet synchronisait déjà.
async function drain(db: AgentDatabase, options: RunnerOptions): Promise<SyncRunOutcome> {
  let outcome: SyncRunOutcome;
  do {
    outcome = await runSync(db, options);
  } while (outcome.sent > 0 && !outcome.error && outcome.applied > 0);
  return outcome;
}

export function syncOnce(
  key: string,
  db: AgentDatabase,
  options: RunnerOptions,
): Promise<SyncRunOutcome | null> {
  const running = inFlight.get(key);
  if (running) return running;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const run: Promise<SyncRunOutcome | null> = locks
    ? locks
        .request(`bais-sync-${key}`, { ifAvailable: true }, (lock) =>
          lock ? drain(db, options) : Promise.resolve(null),
        )
        // Le type DOM enveloppe la promesse du rappel ; on l'aplatit explicitement.
        .then((value) => value)
    : drain(db, options);
  const task = run.finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
