import { containsLinkOrAddress, withoutInvisible } from "@/modules/notifications/messages";

// Règles pures des groupes de producteurs (ADR-0024) : nom proposé, nom et message validés.
// Aucune dépendance à la base : testées seules, et partagées par le service et les formulaires.

export const MIN_GROUP_NAME_LENGTH = 3;
export const MAX_GROUP_NAME_LENGTH = 120;
export const MAX_GROUP_MESSAGE_LENGTH = 500;

export interface GroupNameParts {
  cropName: string;
  /** Département ou commune ; absent pour tout le pays. */
  scopeName?: string | null;
  campaignCode: string;
  /** Nombre de producteurs retenus (celui du palmarès affiché). */
  count: number;
  metric: "production" | "yield";
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}

/** Nom proposé d'après les critères : « Coton, Borgou, 2024-2025, 100 premiers ». */
export function suggestGroupName(parts: GroupNameParts): string {
  const count = Math.max(0, Math.trunc(parts.count));
  const rank = `${count} premier${count > 1 ? "s" : ""}`;
  return [
    capitalize(parts.cropName.trim().toLocaleLowerCase("fr-FR")),
    parts.scopeName?.trim() || "Bénin",
    parts.campaignCode,
    parts.metric === "yield" ? `${rank} au rendement` : rank,
  ].join(", ");
}

/** Nom du groupe nettoyé (espaces, caractères invisibles), ou null s'il est vide ou trop long. */
export function normalizeGroupName(name: string): string | null {
  const clean = withoutInvisible(name).replace(/\s+/g, " ").trim();
  if (clean.length < MIN_GROUP_NAME_LENGTH || clean.length > MAX_GROUP_NAME_LENGTH) return null;
  return clean;
}

export type GroupMessageCheck =
  { ok: true; text: string } | { ok: false; code: "EMPTY" | "TOO_LONG" | "LINK" };

/**
 * Message du ministère aux membres d'un groupe. Nettoyé (caractères invisibles, espaces en trop,
 * lignes vides répétées), 500 caractères au plus. Ni lien ni adresse e-mail : le message part du
 * numéro officiel vers des centaines de producteurs, un compte compromis ne doit pas pouvoir s'en
 * servir pour de l'hameçonnage (même règle que les citations d'agent, revue de sécurité R5).
 */
export function checkGroupMessage(text: string): GroupMessageCheck {
  const clean = withoutInvisible(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length === 0) return { ok: false, code: "EMPTY" };
  if (clean.length > MAX_GROUP_MESSAGE_LENGTH) return { ok: false, code: "TOO_LONG" };
  if (containsLinkOrAddress(clean)) return { ok: false, code: "LINK" };
  return { ok: true, text: clean };
}

/** Texte reçu sur WhatsApp : l'expéditeur d'abord, comme les autres messages de la plateforme. */
export function groupMessageText(text: string): string {
  return `BAIS, ministère de l'Agriculture : ${text}`;
}
