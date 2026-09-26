"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/features/auth/session";
import { sendFarmerNotificationsQuietly } from "@/modules/notifications";
import { archiveGroup, createGroupFromRanking, sendGroupMessage } from "@/modules/producer-groups";
import { getMessagingChannel } from "@/services/messaging";

export interface GroupActionState {
  status: "idle" | "success" | "error";
  message?: string;
  /** Horodatage du dernier envoi réussi : vide le champ du message, et lui seul. */
  sentAt?: number;
}

const CRITERIA = [
  "cropCode",
  "campaignCode",
  "departementCode",
  "communeCode",
  "metric",
  "verifiedOnly",
] as const;

const CREATE_ERRORS: Record<string, string> = {
  FORBIDDEN: "Réservé au ministère.",
  INVALID_NAME: "Nom du groupe : de 3 à 120 caractères.",
  INVALID: "Critères du palmarès invalides : rechargez la page.",
  EMPTY: "Aucun producteur avec ces critères : aucun groupe créé.",
};

const MESSAGE_ERRORS: Record<string, string> = {
  FORBIDDEN: "Réservé au ministère.",
  NOT_FOUND: "Groupe introuvable.",
  ARCHIVED: "Groupe archivé : il ne reçoit plus de message.",
  EMPTY: "Écrivez le message.",
  TOO_LONG: "500 caractères au plus.",
  LINK: "Pas de lien ni d'adresse e-mail dans le message.",
  NO_RECIPIENT: "Aucun membre n'a donné son accord WhatsApp.",
  DUPLICATE: "Ce message vient d'être envoyé à ce groupe.",
};

const ARCHIVE_ERRORS: Record<string, string> = {
  FORBIDDEN: "Réservé au ministère.",
  NOT_FOUND: "Ce groupe est déjà archivé.",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

// Formation d'un groupe avec les critères du palmarès affiché (champs cachés du formulaire) : le
// service recalcule la liste lui-même, puis on ouvre la fiche du groupe.
export async function createGroupAction(
  _previous: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const user = await requireRole("ADMIN_STATE");
  const input = Object.fromEntries(
    CRITERIA.map((key) => [key, formData.get(key) ?? undefined]).filter(([, v]) => v !== ""),
  );
  const limit = z.coerce.number().int().safeParse(formData.get("limit"));
  const result = await createGroupFromRanking(
    user.actor,
    input,
    String(formData.get("name") ?? ""),
    limit.success ? limit.data : 0,
  );
  if (!result.ok) return { status: "error", message: CREATE_ERRORS[result.code] };
  revalidatePath("/pilotage/groupes");
  redirect(`/pilotage/groupes/${result.id}` as Route);
}

// Message WhatsApp aux membres consentants : mis en file par le service (journalisé), envoyé
// juste après la réponse, le reste par la tâche planifiée.
export async function sendGroupMessageAction(
  _previous: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const user = await requireRole("ADMIN_STATE");
  const id = z.uuid().safeParse(formData.get("groupId"));
  if (!id.success) return { status: "error", message: MESSAGE_ERRORS.NOT_FOUND };
  const result = await sendGroupMessage(user.actor, id.data, String(formData.get("text") ?? ""));
  if (!result.ok) return { status: "error", message: MESSAGE_ERRORS[result.code] };
  after(() => sendFarmerNotificationsQuietly(getMessagingChannel, result.notificationIds));
  revalidatePath(`/pilotage/groupes/${id.data}`);
  const demo =
    result.demo > 0
      ? `, dont ${plural(result.demo, "fiche")} de démonstration qui ne le recevront pas`
      : "";
  return {
    status: "success",
    message: `Message mis en file pour ${plural(result.queued, "membre")}${demo}.`,
    sentAt: Date.now(),
  };
}

export async function archiveGroupAction(
  _previous: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const user = await requireRole("ADMIN_STATE");
  const id = z.uuid().safeParse(formData.get("groupId"));
  if (!id.success) return { status: "error", message: ARCHIVE_ERRORS.NOT_FOUND };
  const result = await archiveGroup(user.actor, id.data);
  if (!result.ok) return { status: "error", message: ARCHIVE_ERRORS[result.code] };
  revalidatePath("/pilotage/groupes");
  revalidatePath(`/pilotage/groupes/${id.data}`);
  return { status: "success", message: "Groupe archivé." };
}
