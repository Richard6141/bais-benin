"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { setWhatsappConsent } from "@/modules/notifications";

export interface ConsentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const schema = z.object({
  consent: z.enum(["WHATSAPP"]),
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
  const result = await setWhatsappConsent(user.actor, parsed.data.granted);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  revalidatePath("/compte");
  return {
    status: "success",
    message: parsed.data.granted ? "Accord enregistré." : "Accord retiré.",
  };
}
