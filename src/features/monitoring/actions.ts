"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { AlertAccessError, acknowledgeAlert } from "@/modules/monitoring/delivery";

export type AcknowledgeState =
  { ok: true; acknowledgedAt: string } | { ok: false; message: string };

// Accusé de lecture d'une alerte (monitoring §2.A, écran A2). Idempotent côté service : une
// seconde lecture ne change rien. Un utilisateur qui n'est pas destinataire (agent, ministère)
// reçoit un refus neutre, sans effet sur l'affichage.
export async function acknowledgeAlertAction(alertId: string): Promise<AcknowledgeState> {
  const parsed = z.uuid().safeParse(alertId);
  if (!parsed.success) return { ok: false, message: "Alerte inconnue." };
  const user = await requireUser();
  try {
    const result = await acknowledgeAlert(user.actor, parsed.data);
    revalidatePath("/agriculteur");
    revalidatePath("/agriculteur/alertes");
    return { ok: true, acknowledgedAt: result.acknowledgedAt.toISOString() };
  } catch (error) {
    if (error instanceof AlertAccessError) return { ok: false, message: error.message };
    throw error;
  }
}
