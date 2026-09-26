import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { consumeRateLimit } from "@/lib/rate-limit";
import { formatCsv } from "@/modules/analytics/csv";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import {
  FEEDBACK_KINDS,
  FEEDBACK_ROLES,
  FEEDBACK_STATUSES,
  KIND_LABELS,
  MESSAGE_MAX,
  ROLE_LABELS,
  STATUS_LABELS,
  cleanPagePath,
  feedbackInput,
  maskFeedbackMessage,
  roleForPage,
  type FeedbackKind,
  type FeedbackRole,
  type FeedbackStatus,
} from "./rules";

// Avis des testeurs (chantier J) : dépôt par tout compte connecté, lecture, classement et export
// par le ministère. Aucun envoi sortant : tout reste en base. Le message est masqué avant
// l'écriture ; l'auteur n'est jamais montré, seul son rôle l'est.

/** Dix avis par heure et par compte : assez pour un testeur, trop peu pour un envoi en masse. */
const RATE_LIMIT = { windowSeconds: 3600, max: 10 };

export class FeedbackError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}

/** Dépose un avis ; lève FeedbackError si le compte n'a pas le droit, dépasse la limite ou se trompe. */
export async function createFeedback(actor: Actor, raw: unknown): Promise<{ id: string }> {
  if (!authorize(actor, "feedback.create", { ownerUserId: actor.userId }).allowed) {
    throw new FeedbackError("FORBIDDEN", "Connectez-vous pour donner votre avis.");
  }
  const parsed = feedbackInput.safeParse(raw);
  if (!parsed.success) {
    throw new FeedbackError(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Avis incomplet : vérifiez le formulaire.",
    );
  }
  const pagePath = cleanPagePath(parsed.data.pagePath);
  const role = roleForPage(
    pagePath,
    actor.grants.map((grant) => grant.role),
  );
  if (!role) throw new FeedbackError("FORBIDDEN", "Aucun rôle rattaché à ce compte.");
  if (!(await consumeRateLimit(`feedback:${actor.userId}`, RATE_LIMIT))) {
    throw new FeedbackError(
      "RATE_LIMITED",
      "Vous avez envoyé beaucoup d'avis : réessayez dans une heure.",
    );
  }
  const created = await prisma.testerFeedback.create({
    data: {
      authorId: actor.userId,
      role,
      kind: parsed.data.kind,
      message: maskFeedbackMessage(parsed.data.message).slice(0, MESSAGE_MAX),
      rating: parsed.data.rating ?? null,
      pagePath,
      device: parsed.data.device,
    },
    select: { id: true },
  });
  await recordAudit({
    action: "feedback.created",
    actorId: actor.userId,
    resourceType: "tester_feedback",
    resourceId: created.id,
    details: { kind: parsed.data.kind, role },
  });
  return created;
}

export interface FeedbackFilters {
  kind?: FeedbackKind;
  role?: FeedbackRole;
  status?: FeedbackStatus;
}

/** Filtres lus dans l'adresse ; une valeur inconnue est ignorée. */
export function parseFeedbackFilters(
  params: Record<string, string | string[] | undefined>,
): FeedbackFilters {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined;
  return {
    kind: pick(params.type, FEEDBACK_KINDS),
    role: pick(params.role, FEEDBACK_ROLES),
    status: pick(params.statut, FEEDBACK_STATUSES),
  };
}

export interface FeedbackRow {
  id: string;
  createdAt: Date;
  kind: FeedbackKind;
  role: FeedbackRole;
  message: string;
  rating: number | null;
  pagePath: string;
  device: "MOBILE" | "DESKTOP";
  status: FeedbackStatus;
  statusChangedAt: Date | null;
}

function requireManager(actor: Actor): void {
  if (!authorize(actor, "feedback.manage").allowed) {
    throw new FeedbackError("FORBIDDEN", "Lecture des avis réservée au ministère.");
  }
}

function whereOf(filters: FeedbackFilters): Prisma.TesterFeedbackWhereInput {
  return {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

/** Avis du plus récent au plus ancien, sans leur auteur. Ministère seulement. */
export async function listFeedback(
  actor: Actor,
  filters: FeedbackFilters = {},
  limit = 500,
): Promise<FeedbackRow[]> {
  requireManager(actor);
  return prisma.testerFeedback.findMany({
    where: whereOf(filters),
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      kind: true,
      role: true,
      message: true,
      rating: true,
      pagePath: true,
      device: true,
      status: true,
      statusChangedAt: true,
    },
  });
}

/** Avis encore nouveaux, pour le compteur du pilotage ; null hors ministère. */
export async function countNewFeedback(actor: Actor): Promise<number | null> {
  if (!authorize(actor, "feedback.manage").allowed) return null;
  return prisma.testerFeedback.count({ where: { status: "NEW" } });
}

/** Change l'état d'un avis et le journalise. Ministère seulement. */
export async function setFeedbackStatus(
  actor: Actor,
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  requireManager(actor);
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
    throw new FeedbackError("INVALID", "État inconnu.");
  }
  const existing = await prisma.testerFeedback.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) throw new FeedbackError("NOT_FOUND", "Avis introuvable.");
  if (existing.status === status) return;
  await prisma.testerFeedback.update({
    where: { id },
    data: { status, statusChangedAt: new Date(), statusChangedById: actor.userId },
  });
  await recordAudit({
    action: "feedback.status.changed",
    actorId: actor.userId,
    resourceType: "tester_feedback",
    resourceId: id,
    details: { from: existing.status, to: status },
  });
}

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Porto-Novo",
});

/** Export CSV des avis filtrés, lisible par Excel en français. Ministère seulement. */
export async function exportFeedbackCsv(
  actor: Actor,
  filters: FeedbackFilters = {},
): Promise<{ filename: string; content: string }> {
  const rows = await listFeedback(actor, filters, 10_000);
  const content = formatCsv(
    ["date", "type", "role", "note", "page", "ecran", "etat", "message"],
    rows.map((row) => [
      dateTime.format(row.createdAt),
      KIND_LABELS[row.kind],
      ROLE_LABELS[row.role],
      row.rating,
      row.pagePath,
      row.device === "MOBILE" ? "mobile" : "ordinateur",
      STATUS_LABELS[row.status],
      row.message,
    ]),
  );
  return { filename: `avis-testeurs-${new Date().toISOString().slice(0, 10)}.csv`, content };
}
