"use server";

import { requireUser } from "@/features/auth/session";
import { FeedbackError, createFeedback } from "@/modules/feedback";

export interface FeedbackActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

/** Dépose l'avis du compte connecté ; aucun envoi sortant, tout reste en base. */
export async function submitFeedbackAction(
  _previous: FeedbackActionState,
  form: FormData,
): Promise<FeedbackActionState> {
  const user = await requireUser();
  const rating = String(form.get("rating") ?? "");
  try {
    await createFeedback(user.actor, {
      kind: String(form.get("kind") ?? ""),
      message: String(form.get("message") ?? ""),
      rating: rating === "" ? undefined : rating,
      pagePath: String(form.get("pagePath") ?? "/"),
      device: String(form.get("device") ?? "DESKTOP"),
    });
    return { status: "success" };
  } catch (error) {
    if (error instanceof FeedbackError) return { status: "error", message: error.message };
    throw error;
  }
}
