import { prisma } from "@/database/client";
import type { FieldReportStatus, FieldReportType, Prisma } from "@/generated/prisma/client";
import { authorize, scopeFilter, type Actor, type ResourceRef } from "@/modules/authorization";

// Lecture des signalements selon le droit `report.read` : le producteur voit ceux de ses
// exploitations, l'agent ceux des exploitations qu'il a enregistrées (ADR-0014), le ministère
// tout. Un signalement hors de portée répond comme absent.

export interface ReportListItem {
  id: string;
  type: FieldReportType;
  status: FieldReportStatus;
  description: string;
  cropCode: string | null;
  observedAt: Date;
  createdAt: Date;
  hasPhoto: boolean;
  locationSource: string;
  farm: { id: string; code: string; name: string | null; farmerName: string };
  parcelCode: string | null;
  communeName: string;
  reportedByName: string;
  review: { at: Date; note: string | null; byName: string | null } | null;
}

function scopeWhere(actor: Actor): Prisma.FieldReportWhereInput | null {
  const filter = scopeFilter(actor, "report.read");
  switch (filter.kind) {
    case "all":
      return {};
    case "none":
      return null;
    case "self":
      return { farm: { farmer: { userId: filter.userId } } };
    case "registered":
      return { farm: { registeredById: filter.userId } };
    case "territory": {
      const clauses: Prisma.FieldReportWhereInput[] = [];
      if (filter.communeIds.length > 0) clauses.push({ communeId: { in: filter.communeIds } });
      if (filter.departementIds.length > 0) {
        clauses.push({ commune: { departementId: { in: filter.departementIds } } });
      }
      if (filter.includeSelf) clauses.push({ farm: { farmer: { userId: actor.userId } } });
      return clauses.length > 0 ? { OR: clauses } : null;
    }
  }
}

const listSelect = {
  id: true,
  type: true,
  status: true,
  description: true,
  cropCode: true,
  observedAt: true,
  createdAt: true,
  locationSource: true,
  reviewedAt: true,
  reviewNote: true,
  photo: { select: { reportId: true } },
  farm: {
    select: {
      id: true,
      code: true,
      name: true,
      farmer: { select: { firstName: true, lastName: true } },
    },
  },
  parcel: { select: { code: true } },
  commune: { select: { name: true } },
  reportedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.FieldReportSelect;

type ListRow = Prisma.FieldReportGetPayload<{ select: typeof listSelect }>;

function toListItem(row: ListRow): ReportListItem {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    description: row.description,
    cropCode: row.cropCode,
    observedAt: row.observedAt,
    createdAt: row.createdAt,
    hasPhoto: row.photo !== null,
    locationSource: row.locationSource,
    farm: {
      id: row.farm.id,
      code: row.farm.code,
      name: row.farm.name,
      farmerName: `${row.farm.farmer.firstName} ${row.farm.farmer.lastName}`,
    },
    parcelCode: row.parcel?.code ?? null,
    communeName: row.commune.name,
    reportedByName: row.reportedBy.name,
    review: row.reviewedAt
      ? { at: row.reviewedAt, note: row.reviewNote, byName: row.reviewedBy?.name ?? null }
      : null,
  };
}

export async function listReportsForActor(
  actor: Actor,
  options: { status?: FieldReportStatus; type?: FieldReportType; limit?: number } = {},
): Promise<ReportListItem[]> {
  const scope = scopeWhere(actor);
  if (scope === null) return [];
  const rows = await prisma.fieldReport.findMany({
    where: {
      AND: [
        scope,
        options.status ? { status: options.status } : {},
        options.type ? { type: options.type } : {},
      ],
    },
    select: listSelect,
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 200),
  });
  return rows.map(toListItem);
}

/** Ressource d'autorisation d'un signalement : celle de son exploitation. */
export async function reportResource(
  reportId: string,
): Promise<{ resource: ResourceRef; farmId: string; status: FieldReportStatus } | null> {
  const row = await prisma.fieldReport.findUnique({
    where: { id: reportId },
    select: {
      status: true,
      farmId: true,
      communeId: true,
      commune: { select: { departementId: true } },
      farm: { select: { registeredById: true, farmer: { select: { userId: true } } } },
    },
  });
  if (!row) return null;
  return {
    farmId: row.farmId,
    status: row.status,
    resource: {
      communeId: row.communeId,
      departementId: row.commune.departementId,
      ownerUserId: row.farm.farmer.userId,
      registeredByUserId: row.farm.registeredById,
    },
  };
}

export async function getReportForActor(
  actor: Actor,
  reportId: string,
): Promise<ReportListItem | null> {
  const found = await reportResource(reportId);
  if (!found || !authorize(actor, "report.read", found.resource).allowed) return null;
  const row = await prisma.fieldReport.findUniqueOrThrow({
    where: { id: reportId },
    select: listSelect,
  });
  return toListItem(row);
}

export async function getReportPhotoForActor(
  actor: Actor,
  reportId: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const found = await reportResource(reportId);
  if (!found || !authorize(actor, "report.read", found.resource).allowed) return null;
  const photo = await prisma.fieldReportPhoto.findUnique({
    where: { reportId },
    select: { contentType: true, bytes: true },
  });
  return photo ? { contentType: photo.contentType, bytes: photo.bytes } : null;
}
