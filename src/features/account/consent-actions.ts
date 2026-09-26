"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { expirePublicRankings } from "@/features/public-ranking/cached";
import { setWhatsappConsent } from "@/modules/notifications";
import { setRankingConsent } from "@/modules/public-ranking";

export interface ConsentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const schema = z.object({
  consent: z.enum(["WHATSAPP", "RANKING"]),
  granted: z.enum(["1", "0"]).transform((value) => value === "1"),
});

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Seul un producteur peut donner cet accord, pour son propre compte.",
  NO_FARMER:
    "Votre compte n'est pas encore relié à une fiche producteur : un agent de votre commune peut le faire.",
};

// Accords que le producteur donne ou retire lui-même depuis son compte. Le service vérifie le
// droit (consent.manage, sur son propre compte) et journalise chaque changement.
export async function setConsentAction(
  _previous: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    consent: formData.get("consent"),
    granted: formData.get("granted"),
  });
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const { consent, granted } = parsed.data;
  const result =
    consent === "WHATSAPP"
      ? await setWhatsappConsent(user.actor, granted)
      : await setRankingConsent(user.actor, granted);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  // Un accord donné ou retiré change la page publique des palmarès : son cache expire aussitôt.
  if (consent === "RANKING") expirePublicRankings();
  revalidatePath("/compte");
  return {
    status: "success",
    message: granted ? "Accord enregistré." : "Accord retiré.",
  };
}
