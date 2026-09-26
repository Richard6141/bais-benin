"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/features/auth/session";
import { FEEDBACK_STATUSES, setFeedbackStatus } from "@/modules/feedback";

const input = z.object({ id: z.uuid(), status: z.enum(FEEDBACK_STATUSES) });

/** Change l'état d'un avis (nouveau, vu, traité) ; journalisé par le module. Ministère seul. */
export async function updateFeedbackStatusAction(form: FormData): Promise<void> {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/avis" });
  const parsed = input.safeParse({ id: form.get("id"), status: form.get("status") });
  if (!parsed.success) return;
  await setFeedbackStatus(user.actor, parsed.data.id, parsed.data.status);
  revalidatePath("/pilotage/avis");
  revalidatePath("/pilotage", "layout");
}
