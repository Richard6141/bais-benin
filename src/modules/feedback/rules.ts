import { z } from "zod";
import { redactPersonalData } from "@/modules/assistant/privacy";

// Avis des testeurs (chantier J), en fonctions pures : ce qu'un avis peut contenir, le rôle qu'on
// lui rattache d'après la page, et le masquage des numéros avant toute écriture.

export const FEEDBACK_KINDS = ["BUG", "CONFUSING", "IDEA"] as const;
export const FEEDBACK_STATUSES = ["NEW", "SEEN", "DONE"] as const;
export const FEEDBACK_DEVICES = ["MOBILE", "DESKTOP"] as const;
export const FEEDBACK_ROLES = [
  "ADMIN_STATE",
  "AGENT_AGRICULTURE",
  "FARMER",
  "COOPERATIVE",
  "BUYER",
] as const;
export const MESSAGE_MAX = 1000;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackRole = (typeof FEEDBACK_ROLES)[number];

export const KIND_LABELS: Record<FeedbackKind, string> = {
  BUG: "Quelque chose ne marche pas",
  CONFUSING: "C'est difficile à comprendre",
  IDEA: "Une idée",
};
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: "Nouveau",
  SEEN: "Vu",
  DONE: "Traité",
};
export const ROLE_LABELS: Record<FeedbackRole, string> = {
  ADMIN_STATE: "Ministère",
  AGENT_AGRICULTURE: "Agent",
  FARMER: "Agriculteur",
  COOPERATIVE: "Coopérative",
  BUYER: "Acheteur",
};

/** Ce que le formulaire envoie ; la page et le type d'écran sont ajoutés sans être montrés. */
export const feedbackInput = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z
    .string()
    .trim()
    .min(3, "Écrivez votre avis en quelques mots.")
    .max(MESSAGE_MAX, `${MESSAGE_MAX} caractères au plus.`),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  pagePath: z.string().max(2000),
  device: z.enum(FEEDBACK_DEVICES),
});

export type FeedbackInput = z.infer<typeof feedbackInput>;

/**
 * Chemin de la page, sans paramètres ni ancre (ils peuvent porter un identifiant), borné à 300
 * caractères ; une valeur qui n'est pas un chemin devient « / ».
 */
export function cleanPagePath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path.slice(0, 300);
}

const SPACE_ROLES: readonly [string, FeedbackRole][] = [
  ["/agriculteur", "FARMER"],
  ["/agent", "AGENT_AGRICULTURE"],
  ["/pilotage", "ADMIN_STATE"],
  ["/salle-de-situation", "ADMIN_STATE"],
  ["/cooperative", "COOPERATIVE"],
  ["/acheteur", "BUYER"],
];

/**
 * Rôle rattaché à l'avis : celui de l'espace de la page, si l'auteur l'a ; sinon son premier
 * rôle. Un compte à plusieurs rôles est ainsi compté là où il testait.
 */
export function roleForPage(pagePath: string, roles: readonly string[]): FeedbackRole | null {
  const known = roles.filter((role): role is FeedbackRole =>
    (FEEDBACK_ROLES as readonly string[]).includes(role),
  );
  const space = SPACE_ROLES.find(
    ([prefix]) => pagePath === prefix || pagePath.startsWith(`${prefix}/`),
  )?.[1];
  if (space && known.includes(space)) return space;
  return known[0] ?? null;
}

/** Message tel qu'il est gardé : numéros de téléphone, NPI et adresses e-mail masqués. */
export function maskFeedbackMessage(message: string): string {
  return redactPersonalData(message.trim());
}
