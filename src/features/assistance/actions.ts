"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { resolveRequest, takeChargeOfRequest } from "@/modules/assistance";
import { sendFarmerNotificationsQuietly } from "@/modules/notifications";
import { getMessagingChannel } from "@/services/messaging";

export interface HandleActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const schema = z.object({
  requestId: z.uuid(),
  step: z.enum(["TAKE", "RESOLVE"]),
  note: z.string().max(1000).default(""),
});

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "Demande introuvable.",
  FORBIDDEN: "Vous ne pouvez pas traiter cette demande.",
  INVALID_STATE: "Cette demande a déjà changé de statut : rechargez la page.",
  NOTE_REQUIRED: "Écrivez la réponse donnée au producteur : il la lira dans son espace.",
};

// Prise en charge puis résolution d'une demande par un agent de la commune. Le service vérifie
// le droit (assistance.handle) et journalise chaque passage ; le message WhatsApp au producteur
// part après la réponse, sans la retarder.
export async function handleAssistanceAction(
  _previous: HandleActionState,
  formData: FormData,
): Promise<HandleActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    requestId: formData.get("requestId"),
    step: formData.get("step"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const { requestId, step, note } = parsed.data;
  const result =
    step === "TAKE"
      ? await takeChargeOfRequest(user.actor, requestId)
      : await resolveRequest(user.actor, requestId, note);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  after(() => sendFarmerNotificationsQuietly(getMessagingChannel, [result.notificationId]));
  revalidatePath("/agent/demandes");
  return {
    status: "success",
    message: step === "TAKE" ? "Demande prise en charge." : "Demande résolue.",
  };
}
