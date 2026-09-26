import { prisma } from "@/database/client";
import type { AssistanceCategory, AssistanceStatus, Prisma } from "@/generated/prisma/client";
import { authorize, scopeFilter, type Actor, type ResourceRef } from "@/modules/authorization";

// Lecture des demandes d'assistance selon `assistance.read` : le producteur voit les siennes,
// l'agent celles de sa commune (ou de son département). C'est une exception voulue à ADR-0014 :
// un producteur inscrit par lui-même n'a pas d'agent enregistreur, et sa demande doit arriver à
// quelqu'un. L'agent n'en reçoit que ce qui sert à la traiter (objet, message, commune, contact),
// jamais la fiche d'une exploitation qu'il n'a pas enregistrée. Le ministère n'en lit que les
// agrégats (stats.ts). Une demande hors de portée répond comme absente.

export interface AssistanceItem {
  id: string;
  category: AssistanceCategory;
  status: AssistanceStatus;
  description: string;
  createdAt: Date;
  takenAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  communeName: string;
  farm: { id: string; code: string; name: string | null } | null;
  requesterName: string;
  /** Numéro du producteur, pour que l'agent le rappelle ; jamais montré au producteur lui-même. */
  requesterPhone: string | null;
  handledByName: string | null;
}

function scopeWhere(actor: Actor): Prisma.AssistanceRequestWhereInput | null {
  const filter = scopeFilter(actor, "assistance.read");
  switch (filter.kind) {
    case "all":
      return {};
    case "none":
    case "registered":
      return null;
    case "self":
      return { requesterId: filter.userId };
    case "territory": {
      const clauses: Prisma.AssistanceRequestWhereInput[] = [];
      if (filter.communeIds.length > 0) clauses.push({ communeId: { in: filter.communeIds } });
      if (filter.departementIds.length > 0) {
        clauses.push({ commune: { departementId: { in: filter.departementIds } } });
      }
      if (filter.includeSelf) clauses.push({ requesterId: actor.userId });
      return clauses.length > 0 ? { OR: clauses } : null;
    }
  }
}

const select = {
  id: true,
  category: true,
  status: true,
  description: true,
  createdAt: true,
  takenAt: true,
  resolvedAt: true,
  resolutionNote: true,
  requesterId: true,
  commune: { select: { name: true } },
  farm: {
    select: {
      id: true,
      code: true,
      name: true,
      registeredById: true,
      farmer: { select: { userId: true } },
    },
  },
  requester: { select: { name: true, phoneNumber: true } },
  handledBy: { select: { name: true } },
} satisfies Prisma.AssistanceRequestSelect;

type Row = Prisma.AssistanceRequestGetPayload<{ select: typeof select }>;

function toItem(row: Row, actor: Actor): AssistanceItem {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    description: row.description,
    createdAt: row.createdAt,
    takenAt: row.takenAt,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
    communeName: row.commune.name,
    // Exception à ADR-0014 limitée : l'agent de la commune traite la demande (objet, message,
    // commune, contact), mais l'exploitation n'est nommée que s'il peut déjà la lire (il l'a
    // enregistrée, ou c'est la demande du producteur lui-même).
    farm:
      row.farm &&
      authorize(actor, "farm.read", {
        ownerUserId: row.farm.farmer.userId,
        registeredByUserId: row.farm.registeredById,
      }).allowed
        ? { id: row.farm.id, code: row.farm.code, name: row.farm.name }
        : null,
    requesterName: row.requester.name,
    requesterPhone: row.requesterId === actor.userId ? null : row.requester.phoneNumber,
    handledByName: row.handledBy?.name ?? null,
  };
}

export async function listAssistanceForActor(
  actor: Actor,
  options: { status?: AssistanceStatus; limit?: number } = {},
): Promise<AssistanceItem[]> {
  const scope = scopeWhere(actor);
  if (scope === null) return [];
  const rows = await prisma.assistanceRequest.findMany({
    where: { AND: [scope, options.status ? { status: options.status } : {}] },
    select,
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 200),
  });
  return rows.map((row) => toItem(row, actor));
}

/** Ressource d'autorisation d'une demande : sa commune et son auteur. */
export async function assistanceResource(
  id: string,
): Promise<{ resource: ResourceRef; status: AssistanceStatus } | null> {
  const row = await prisma.assistanceRequest.findUnique({
    where: { id },
    select: {
      status: true,
      communeId: true,
      requesterId: true,
      commune: { select: { departementId: true } },
    },
  });
  if (!row) return null;
  return {
    status: row.status,
    resource: {
      communeId: row.communeId,
      departementId: row.commune.departementId,
      ownerUserId: row.requesterId,
    },
  };
}
