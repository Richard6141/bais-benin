"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { AttestationError, issueAttestation, revokeAttestation } from "@/modules/attestations";

export interface AttestationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
}

const farmIdSchema = z.string().uuid();

/** Établit une nouvelle attestation pour l'exploitation, puis rafraîchit la page qui l'affiche. */
export async function issueAttestationAction(
  _previous: AttestationActionState,
  form: FormData,
): Promise<AttestationActionState> {
  const user = await requireUser();
  const farmId = farmIdSchema.safeParse(form.get("farmId"));
  const path = String(form.get("path") ?? "");
  if (!farmId.success) return { status: "error", message: "Exploitation inconnue." };
  try {
    const code = await issueAttestation(user.actor, farmId.data);
    if (path.startsWith("/")) revalidatePath(path);
    return { status: "success", code };
  } catch (error) {
    if (error instanceof AttestationError) {
      return { status: "error", message: "Exploitation introuvable dans votre périmètre." };
    }
    throw error;
  }
}

export async function revokeAttestationAction(
  _previous: AttestationActionState,
  form: FormData,
): Promise<AttestationActionState> {
  const user = await requireUser();
  const code = String(form.get("code") ?? "");
  const path = String(form.get("path") ?? "");
  try {
    await revokeAttestation(user.actor, code);
    if (path.startsWith("/")) revalidatePath(path);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AttestationError)
      return { status: "error", message: "Attestation introuvable." };
    throw error;
  }
}
