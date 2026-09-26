"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/features/auth/session";
import { MAX_PUBLISHED_LAUREATES, publishRanking, withdrawRanking } from "@/modules/public-ranking";

export interface PublicationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const CRITERIA = [
  "cropCode",
  "campaignCode",
  "departementCode",
  "communeCode",
  "metric",
  "verifiedOnly",
] as const;

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Publication réservée au ministère.",
  INVALID: `Choisissez entre 1 et ${MAX_PUBLISHED_LAUREATES} lauréats, pour une campagne connue.`,
  NO_CONSENTING:
    "Aucun producteur de ce classement n'a donné son accord pour un palmarès public : rien n'est publié.",
  NOT_FOUND: "Ce palmarès est déjà retiré.",
};

// Publication d'un palmarès public avec les critères affichés (champs cachés du formulaire) :
// le service ne retient que les lauréats consentants et journalise la publication.
export async function publishRankingAction(
  _previous: PublicationActionState,
  formData: FormData,
): Promise<PublicationActionState> {
  const user = await requireRole("ADMIN_STATE");
  const input = Object.fromEntries(
    CRITERIA.map((key) => [key, formData.get(key) ?? undefined]).filter(([, v]) => v !== ""),
  );
  const count = z.coerce.number().int().safeParse(formData.get("laureates"));
  const result = await publishRanking(user.actor, input, count.success ? count.data : 0);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  revalidatePath("/pilotage/palmares");
  return {
    status: "success",
    message: `Palmarès publié avec ${result.laureates} lauréat${result.laureates > 1 ? "s" : ""}.`,
  };
}

export async function withdrawRankingAction(
  _previous: PublicationActionState,
  formData: FormData,
): Promise<PublicationActionState> {
  const user = await requireRole("ADMIN_STATE");
  const id = z.uuid().safeParse(formData.get("rankingId"));
  if (!id.success) return { status: "error", message: "Demande invalide." };
  const result = await withdrawRanking(user.actor, id.data);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  revalidatePath("/pilotage/palmares");
  return { status: "success", message: "Palmarès retiré de la page publique." };
}
