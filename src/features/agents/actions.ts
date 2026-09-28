"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/features/auth/session";
import {
  createAgent,
  revokeAgent,
  updateAgentScope,
  type AgentErrorCode,
} from "@/modules/identity";

export interface AgentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const MESSAGES: Record<AgentErrorCode, string> = {
  FORBIDDEN: "Seul le ministère gère les agents.",
  INVALID_NPI: "NPI invalide : treize chiffres, tel qu'il figure sur la carte d'identité.",
  INVALID_PHONE: "Numéro invalide : dix chiffres commençant par 01.",
  INVALID_NAME: "Indiquez le nom et le prénom de l'agent.",
  EMPTY_SCOPE: "Choisissez au moins une commune ou un département.",
  TOO_WIDE: "Trop de territoires choisis : prenez plutôt des départements entiers.",
  UNKNOWN_TERRITORY: "Un territoire choisi n'existe plus : rechargez la page.",
  NOT_AN_AGENT: "Ce compte n'a plus d'accès d'agent : rechargez la page.",
  MINISTRY_ACCOUNT: "Ce numéro appartient à un compte du ministère.",
  IDENTITY_CONFLICT:
    "Ce NPI et ce numéro ne désignent pas le même compte. Vérifiez les deux avec l'agent.",
};

const uuidList = z.array(z.uuid()).max(100);

function scopeOf(formData: FormData) {
  return {
    communeIds: formData.getAll("commune").map(String),
    departementIds: formData.getAll("departement").map(String),
  };
}

const createSchema = z.object({
  npi: z.string().max(40),
  phone: z.string().max(40),
  name: z.string().max(120),
  communeIds: uuidList,
  departementIds: uuidList,
});

function refresh() {
  revalidatePath("/pilotage/agents");
}

/** Ouvre le compte d'un agent (ou lui rend l'accès) avec son périmètre. Ministère seul. */
export async function createAgentAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/agents" });
  const parsed = createSchema.safeParse({
    npi: formData.get("npi") ?? "",
    phone: formData.get("telephone") ?? "",
    name: formData.get("nom") ?? "",
    ...scopeOf(formData),
  });
  if (!parsed.success) return { status: "error", message: "Formulaire incomplet." };
  const result = await createAgent(user.actor, parsed.data);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  refresh();
  return {
    status: "success",
    message: result.created
      ? "Compte ouvert. L'agent se connecte avec son NPI, son numéro et le code reçu sur WhatsApp."
      : "Accès d'agent donné à ce compte existant, avec le périmètre choisi.",
  };
}

const updateSchema = z.object({
  userId: z.uuid(),
  communeIds: uuidList,
  departementIds: uuidList,
});

/** Réaffecte un agent : son périmètre devient celui choisi. Ministère seul. */
export async function updateAgentScopeAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/agents" });
  const parsed = updateSchema.safeParse({ userId: formData.get("userId"), ...scopeOf(formData) });
  if (!parsed.success) return { status: "error", message: "Formulaire incomplet." };
  const { userId, ...scope } = parsed.data;
  const result = await updateAgentScope(user.actor, userId, scope);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  refresh();
  return { status: "success", message: "Périmètre enregistré." };
}

/** Retire l'accès d'agent d'un compte. Ministère seul. */
export async function revokeAgentAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/agents" });
  const parsed = z.uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return { status: "error", message: "Formulaire incomplet." };
  const result = await revokeAgent(user.actor, parsed.data);
  if (!result.ok) return { status: "error", message: MESSAGES[result.code] };
  refresh();
  return { status: "success", message: "Accès retiré." };
}
