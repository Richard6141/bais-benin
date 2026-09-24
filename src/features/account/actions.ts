"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { attachNpi } from "@/modules/identity";

const npiSchema = z.object({
  npi: z.string().min(1, "Saisissez votre NPI"),
  lastName: z.string().trim().min(2, "Le nom tel qu'il figure sur la carte d'identité"),
  birthYear: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().min(1900).max(new Date().getFullYear()).optional()),
});

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

// Rattachement du NPI depuis la page Compte. L'utilisateur ne peut agir que sur son
// propre compte ; le NPI n'est jamais renvoyé au client, seulement son état masqué.
export async function attachNpiAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = npiSchema.safeParse({
    npi: formData.get("npi"),
    lastName: formData.get("lastName"),
    birthYear: formData.get("birthYear") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "npi");
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", fieldErrors };
  }

  try {
    const result = await attachNpi({ userId: user.id, ...parsed.data });
    if (!result.ok) return { status: "error", message: result.reason };
    revalidatePath("/compte");
    return {
      status: "success",
      message:
        result.status === "PENDING"
          ? `NPI enregistré (${result.masked}). La vérification auprès de l'ANIP sera effectuée dès l'ouverture de l'accès.`
          : `NPI enregistré et vérifié (${result.masked}).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enregistrement impossible";
    return { status: "error", message };
  }
}
