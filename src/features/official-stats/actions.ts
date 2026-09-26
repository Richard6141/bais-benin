"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/features/auth/session";
import { MAX_BYTES, importOfficialStatistics } from "@/modules/official-stats";

export interface OfficialImportState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: { line: number; message: string }[];
}

/** Importe un fichier CSV de statistiques officielles (ADR-0034), puis rafraîchit le pilotage. */
export async function importOfficialStatisticsAction(
  _previous: OfficialImportState,
  form: FormData,
): Promise<OfficialImportState> {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/cultures" });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choisissez un fichier CSV." };
  }
  if (file.size > MAX_BYTES) {
    return { status: "error", message: "Fichier de plus de 900 ko : coupez-le en plusieurs." };
  }
  const result = await importOfficialStatistics(user.actor, {
    name: file.name,
    text: await file.text(),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: "Rien n'a été importé : corrigez ces lignes et réimportez le fichier.",
      errors: result.errors,
    };
  }
  revalidatePath("/pilotage/cultures");
  return {
    status: "success",
    message: `${result.imported} chiffres importés (${result.sources.join(", ")}, campagnes ${result.campaigns.join(", ")}).`,
  };
}
