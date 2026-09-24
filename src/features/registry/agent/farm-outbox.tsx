"use client";

import { OutboxList } from "./outbox-list";

// Onglet « Activité » d'une fiche : les commandes de cet appareil qui concernent l'exploitation.
export function FarmOutbox({ userId, farmId }: { userId: string; farmId: string }) {
  return <OutboxList userId={userId} farmId={farmId} />;
}
