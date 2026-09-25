"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/features/auth/session";
import {
  RuleAdminError,
  createRuleVersion,
  simulateRule,
  toggleRule,
  type RulePatch,
  type SimulationSummary,
} from "@/modules/monitoring/rule-admin";

// Actions serveur de la gouvernance des règles (/pilotage/regles). Chaque action repasse par
// requireRole("ADMIN_STATE"), qui impose la double authentification, puis par le service qui
// vérifie le droit et journalise.

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; issues?: { path: string; message: string }[] };

function failure(error: unknown): {
  ok: false;
  message: string;
  issues?: { path: string; message: string }[];
} {
  if (error instanceof RuleAdminError)
    return { ok: false, message: error.message, issues: error.issues };
  return { ok: false, message: error instanceof Error ? error.message : "Action impossible" };
}

export async function toggleRuleAction(input: {
  code: string;
  enabled: boolean;
  reason?: string;
  confirmed?: boolean;
}): Promise<ActionResult> {
  const user = await requireRole("ADMIN_STATE");
  try {
    await toggleRule(user.actor, input);
    revalidatePath("/pilotage/regles");
    revalidatePath(`/pilotage/regles/${input.code}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function createRuleVersionAction(
  code: string,
  patch: RulePatch,
): Promise<ActionResult<{ version: number }>> {
  const user = await requireRole("ADMIN_STATE");
  try {
    const { rule } = await createRuleVersion(user.actor, code, patch);
    revalidatePath("/pilotage/regles");
    revalidatePath(`/pilotage/regles/${code}`);
    return { ok: true, data: { version: rule.version } };
  } catch (error) {
    return failure(error);
  }
}

export async function simulateRuleAction(input: {
  code: string;
  draftDefinition?: unknown;
  from: string;
  to: string;
}): Promise<ActionResult<SimulationSummary>> {
  const user = await requireRole("ADMIN_STATE");
  try {
    return { ok: true, data: await simulateRule(user.actor, input) };
  } catch (error) {
    return failure(error);
  }
}
