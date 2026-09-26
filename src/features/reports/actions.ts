"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { sendFarmerNotificationsQuietly } from "@/modules/notifications";
import { reviewReport } from "@/modules/reports";
import { getMessagingChannel } from "@/services/messaging";

export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const schema = z.object({
  reportId: z.uuid(),
  decision: z.enum(["CONFIRMED", "DISMISSED"]),
  note: z.string().max(1000).default(""),
});

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "Signalement introuvable.",
  FORBIDDEN: "Vous ne pouvez pas statuer sur ce signalement.",
  ALREADY_REVIEWED: "Ce signalement a déjà été traité.",
  NOTE_REQUIRED: "Indiquez pourquoi le signalement est écarté : le producteur verra ce motif.",
};

// Suite donnée à un signalement après la visite (agent, ou ministère pour un signalement
// qu'aucun agent ne suit). Le service vérifie le droit et journalise ; le message WhatsApp au
// producteur part après la réponse.
export async function reviewReportAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const result = await reviewReport(
    user.actor,
    parsed.data.reportId,
    parsed.data.decision,
    parsed.data.note,
  );
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  after(() => sendFarmerNotificationsQuietly(getMessagingChannel, [result.notificationId]));
  revalidatePath("/agent/signalements");
  revalidatePath("/pilotage/signalements");
  return {
    status: "success",
    message: parsed.data.decision === "CONFIRMED" ? "Signalement confirmé." : "Signalement écarté.",
  };
}
