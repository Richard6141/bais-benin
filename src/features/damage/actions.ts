"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { DamageError, requestBurnAssessment } from "@/modules/fires";

// Demande de mesure de surface brûlée d'une exploitation (ADR-0038 §2), depuis sa fiche : les
// parcelles au contour relevé exposées à un feu des 30 derniers jours sont mises en file.

export type BurnRequestState =
  { status: "idle" } | { status: "queued"; parcels: number } | { status: "error"; message: string };

export async function requestBurnAction(
  _previous: BurnRequestState,
  form: FormData,
): Promise<BurnRequestState> {
  const user = await requireUser();
  const farmId = z.uuid().safeParse(form.get("farmId"));
  if (!farmId.success) return { status: "error", message: "Exploitation introuvable." };
  try {
    return { status: "queued", parcels: await requestBurnAssessment(user.actor, farmId.data) };
  } catch (error) {
    if (error instanceof DamageError) return { status: "error", message: error.message };
    throw error;
  }
}
