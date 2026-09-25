"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { declareHarvestOnline, HARVEST_UNITS, type HarvestUnitCode } from "@/modules/registry";
import {
  LOSS_CAUSES,
  LOSS_LEVELS,
  buildSummary,
  lossesPctFor,
  parseQuantity,
} from "./wizard-logic";

const unitCodes = HARVEST_UNITS.map((u) => u.code) as [string, ...string[]];

const schema = z.object({
  parcelCropId: z.uuid("Choisissez une culture"),
  cropName: z.string().min(1),
  parcelCode: z.string().optional(),
  parcelCount: z.coerce.number().int().min(1).default(1),
  campaignCode: z.string().regex(/^\d{4}-\d{4}$/),
  amount: z
    .string()
    .transform(parseQuantity)
    .pipe(
      z
        .number({ error: "Indiquez une quantité." })
        .positive("Indiquez une quantité.")
        .max(1_000_000, "Quantité invraisemblable, vérifiez l'unité."),
    ),
  unit: z.enum(unitCodes),
  lossLevel: z.enum(LOSS_LEVELS.map((l) => l.code) as [string, ...string[]]).optional(),
  lossCause: z.enum(LOSS_CAUSES.map((c) => c.code) as [string, ...string[]]).optional(),
});

export interface HarvestActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  summary?: string;
  warnings?: string[];
}

// Soumission du parcours « Déclarer ma récolte » : validation Zod, puis application immédiate
// par le serveur de synchronisation (même commande que l'outbox hors ligne). Les avertissements
// du serveur (unité non normalisée, rendement inhabituel) sont renvoyés sans bloquer.
export async function declareHarvestAction(
  _previous: HarvestActionState,
  formData: FormData,
): Promise<HarvestActionState> {
  const user = await requireUser({ returnTo: "/agriculteur/recolte" });
  const raw = Object.fromEntries(
    [
      "parcelCropId",
      "cropName",
      "parcelCode",
      "parcelCount",
      "campaignCode",
      "amount",
      "unit",
      "lossLevel",
      "lossCause",
    ].map((key) => [key, formData.get(key) === "" ? undefined : formData.get(key)]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "amount");
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", fieldErrors };
  }
  const input = parsed.data;
  const lossLevel = input.lossLevel as (typeof LOSS_LEVELS)[number]["code"] | undefined;
  const cause = LOSS_CAUSES.find((c) => c.code === input.lossCause);

  try {
    const result = await declareHarvestOnline(user.actor, {
      parcelCropId: input.parcelCropId,
      declaredQuantity: input.amount,
      unit: input.unit as HarvestUnitCode,
      lossesPct: lossesPctFor(lossLevel),
      lossCause: lossLevel && lossLevel !== "NONE" ? cause?.label : undefined,
    });
    if (result.outcome === "REJECTED" || result.outcome === "CONFLICT") {
      return {
        status: "error",
        message: result.error?.message ?? "La déclaration n'a pas pu être enregistrée.",
      };
    }
    revalidatePath("/agriculteur");
    revalidatePath("/agriculteur/historique");
    const unit = HARVEST_UNITS.find((u) => u.code === input.unit);
    return {
      status: "success",
      summary: buildSummary({
        cropName: input.cropName,
        amount: input.amount,
        unitLabelSingular: unit?.label ?? input.unit,
        parcelCode: input.parcelCode,
        parcelCount: input.parcelCount,
        campaignCode: input.campaignCode,
      }),
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enregistrement impossible";
    return { status: "error", message };
  }
}
